// The only file that calls macOS directly, through Bun's FFI (M4): libproc for processes and sockets,
// Mach and sysctl for memory. Every call returns plain values or null.
//
// Struct offsets and constants come from the SDK headers, not from memory: regenerate them with
//   clang -o /tmp/offsets scripts/darwin-offsets.c && /tmp/offsets
// A load-time self-check reads Kestrel's own process and compares it with what Node reports; on any
// mismatch (a layout change in a future macOS) this returns null and Kestrel falls back to ps/lsof.
const { formatIpv6 } = require('./net');

const PROC_PIDLISTFDS = 1;
const PROC_PIDTASKALLINFO = 2;
const PROC_PIDFDSOCKETINFO = 3;
const PROC_PIDT_SHORTBSDINFO = 13;
const PROX_FDTYPE_SOCKET = 2;
const SOCKINFO_TCP = 2;
const TSI_S_LISTEN = 1;
const INI_IPV4 = 1;
const HOST_VM_INFO64 = 4;
const HOST_VM_INFO64_COUNT = 62;
const PATH_MAX = 4096;
const MAX_PIDS = 1 << 16;
const MAX_FDS = 1 << 16;

// struct proc_taskallinfo = proc_bsdinfo (136) + proc_taskinfo (96)
const TASK = { size: 232, status: 4, ppid: 16, uid: 20, startSec: 120, startUsec: 128,
    rss: 136 + 8, user: 136 + 16, system: 136 + 24, running: 136 + 88 };
const SHORT = { size: 64, ppid: 4, status: 12, comm: 16, commLen: 16, uid: 36 };
// struct socket_fdinfo: psi (socket_info) at 24; soi_kind at +232; soi_proto (tcp_sockinfo) at +240
const SOCK = { size: 792, kind: 256, lport: 264 + 4, vflag: 264 + 24, laddr: 264 + 48, state: 264 + 80 };
// vm_statistics64 (natural_t counters)
const VM = { size: 248, wire: 12, purgeable: 88, compressor: 128, external: 136, internal: 140 };

const decoder = new TextDecoder();
// A variable, not a literal: the module only exists under Bun, and type checking runs under Node.
const FFI_MODULE = 'bun:ffi';

function cString(bytes, offset, maxLength) {
    const end = bytes.indexOf(0, offset);
    return decoder.decode(bytes.subarray(offset, end === -1 || end > offset + maxLength ? offset + maxLength : end));
}

function bind(ffi) {
    const T = ffi.FFIType;
    const libproc = ffi.dlopen('/usr/lib/libproc.dylib', {
        proc_listallpids: { args: [T.ptr, T.i32], returns: T.i32 },
        proc_pidinfo: { args: [T.i32, T.i32, T.u64, T.ptr, T.i32], returns: T.i32 },
        proc_pidpath: { args: [T.i32, T.ptr, T.u32], returns: T.i32 },
        proc_pidfdinfo: { args: [T.i32, T.i32, T.i32, T.ptr, T.i32], returns: T.i32 },
    }).symbols;
    const system = ffi.dlopen('/usr/lib/libSystem.B.dylib', {
        mach_host_self: { args: [], returns: T.u32 },
        host_statistics64: { args: [T.u32, T.i32, T.ptr, T.ptr], returns: T.i32 },
        sysctlbyname: { args: [T.ptr, T.ptr, T.ptr, T.ptr, T.u64], returns: T.i32 },
        getpwuid: { args: [T.u32], returns: T.ptr },
        mach_timebase_info: { args: [T.ptr], returns: T.i32 },
    }).symbols;
    return { libproc, system };
}

/** @param {any} ffi  the `bun:ffi` module */
function createNative(ffi) {
    const { ptr } = ffi;
    const { libproc, system } = bind(ffi);
    const task = new Uint8Array(TASK.size);
    const taskView = new DataView(task.buffer);
    const short = new Uint8Array(SHORT.size);
    const shortView = new DataView(short.buffer);
    const pathBytes = new Uint8Array(PATH_MAX);
    const sock = new Uint8Array(SOCK.size);
    const sockView = new DataView(sock.buffer);
    const vm = new Uint8Array(VM.size);
    const vmView = new DataView(vm.buffer);
    let pids = new Int32Array(4096);
    let fds = new Uint8Array(8 * 1024);

    const timebase = new Uint32Array(2);
    system.mach_timebase_info(ptr(timebase));
    const ticksToNs = timebase[0] / timebase[1];
    const host = system.mach_host_self(); // one send right for the whole run

    function sysctl(name, bytes) {
        const length = new BigUint64Array([BigInt(bytes.byteLength)]);
        const key = Buffer.from(`${name}\0`);
        return system.sysctlbyname(ptr(key), ptr(bytes), ptr(length), null, 0n) === 0 ? Number(length[0]) : -1;
    }

    const pageSizeBytes = new Uint8Array(8);
    const pageSizeLength = sysctl('hw.pagesize', pageSizeBytes);
    const pageView = new DataView(pageSizeBytes.buffer);
    const pageSize = pageSizeLength === 8 ? Number(pageView.getBigInt64(0, true)) : pageView.getInt32(0, true);

    function listPids() {
        for (;;) {
            const count = libproc.proc_listallpids(ptr(pids), pids.byteLength);
            if (count < pids.length || pids.length >= MAX_PIDS) return Array.from(pids.subarray(0, Math.max(0, count)));
            pids = new Int32Array(pids.length * 2);
        }
    }

    // 64-bit fields as two 32-bit halves: exact below 2^53 and much cheaper than BigInt (this runs for
    // every process every tick).
    const u64 = (view, offset) => view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;

    /** Numbers only: names are decoded separately, and only for processes seen for the first time. */
    function taskInfo(pid) {
        if (libproc.proc_pidinfo(pid, PROC_PIDTASKALLINFO, 0n, ptr(task), TASK.size) !== TASK.size) return null;
        return {
            ppid: taskView.getUint32(TASK.ppid, true),
            uid: taskView.getUint32(TASK.uid, true),
            status: taskView.getUint32(TASK.status, true),
            running: taskView.getInt32(TASK.running, true),
            startSec: u64(taskView, TASK.startSec),
            startUsec: u64(taskView, TASK.startUsec),
            rssBytes: u64(taskView, TASK.rss),
            cpuNs: (u64(taskView, TASK.user) + u64(taskView, TASK.system)) * ticksToNs, // Mach absolute time → ns
        };
    }

    function shortInfo(pid) {
        if (libproc.proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0n, ptr(short), SHORT.size) !== SHORT.size) return null;
        return {
            ppid: shortView.getUint32(SHORT.ppid, true),
            uid: shortView.getUint32(SHORT.uid, true),
            status: shortView.getUint32(SHORT.status, true),
        };
    }

    /** The kernel's short name (16 chars), for processes without an executable path (kernel_task…). */
    function comm(pid) {
        if (libproc.proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0n, ptr(short), SHORT.size) !== SHORT.size) return null;
        return cString(short, SHORT.comm, SHORT.commLen) || null;
    }

    function path(pid) {
        const length = libproc.proc_pidpath(pid, ptr(pathBytes), PATH_MAX);
        return length > 0 ? decoder.decode(pathBytes.subarray(0, length)) : null;
    }

    function userName(uid) {
        const entry = system.getpwuid(uid);
        if (!entry) return null;
        const name = ffi.read.ptr(entry, 0); // struct passwd: pw_name first
        return name ? new ffi.CString(name).toString() : null;
    }

    function vmStats() {
        const count = new Uint32Array([HOST_VM_INFO64_COUNT]);
        if (system.host_statistics64(host, HOST_VM_INFO64, ptr(vm), ptr(count)) !== 0) throw new Error('host_statistics64 failed');
        const at = (offset) => vmView.getUint32(offset, true);
        return { pageSize, wire: at(VM.wire), purgeable: at(VM.purgeable), compressor: at(VM.compressor), external: at(VM.external), internal: at(VM.internal) };
    }

    function swapUsage() {
        const usage = new Uint8Array(32); // struct xsw_usage: total @0, avail @8, used @16
        if (sysctl('vm.swapusage', usage) < 24) return { totalBytes: 0, usedBytes: 0 };
        const view = new DataView(usage.buffer);
        return { totalBytes: Number(view.getBigUint64(0, true)), usedBytes: Number(view.getBigUint64(16, true)) };
    }

    function socketAddress() {
        if (sock[SOCK.vflag] & INI_IPV4) {
            const bytes = sock.subarray(SOCK.laddr + 12, SOCK.laddr + 16); // in4in6_addr: 12 bytes pad, then v4
            const text = bytes.join('.');
            return text === '0.0.0.0' ? '*' : text;
        }
        const groups = Array.from({ length: 8 }, (_, i) => sockView.getUint16(SOCK.laddr + i * 2, false));
        return groups.every((g) => g === 0) ? '*' : formatIpv6(groups);
    }

    /** Listening TCP sockets of `pid` ([] when the process is not ours or has none). */
    function listeningSockets(pid) {
        let bytes = libproc.proc_pidinfo(pid, PROC_PIDLISTFDS, 0n, ptr(fds), fds.byteLength);
        while (bytes >= fds.byteLength && fds.byteLength < MAX_FDS * 8) {
            fds = new Uint8Array(fds.byteLength * 2);
            bytes = libproc.proc_pidinfo(pid, PROC_PIDLISTFDS, 0n, ptr(fds), fds.byteLength);
        }
        if (bytes <= 0) return [];
        const view = new DataView(fds.buffer);
        const found = [];
        for (let off = 0; off + 8 <= bytes; off += 8) {
            if (view.getUint32(off + 4, true) !== PROX_FDTYPE_SOCKET) continue;
            const fd = view.getInt32(off, true);
            if (libproc.proc_pidfdinfo(pid, fd, PROC_PIDFDSOCKETINFO, ptr(sock), SOCK.size) < SOCK.size) continue;
            if (sockView.getInt32(SOCK.kind, true) !== SOCKINFO_TCP || sockView.getInt32(SOCK.state, true) !== TSI_S_LISTEN) continue;
            const port = sockView.getUint16(SOCK.lport, false); // network byte order in the low 16 bits
            found.push({ port, address: socketAddress() });
        }
        return found;
    }

    return { listPids, taskInfo, shortInfo, comm, path, userName, vmStats, swapUsage, listeningSockets };
}

/** The native layer, or null (not Bun on macOS, dlopen failed, or the self-check disagreed). */
function loadDarwinNative() {
    if (process.platform !== 'darwin' || !process.versions.bun) return null;
    try {
        const native = createNative(require(FFI_MODULE));
        const self = native.taskInfo(process.pid);
        const plausible = self && self.ppid === process.ppid && self.uid === process.getuid?.()
            && Math.abs(self.startSec * 1000 - (Date.now() - process.uptime() * 1000)) < 60_000;
        return plausible ? native : null;
    } catch {
        return null;
    }
}

module.exports = { loadDarwinNative };
