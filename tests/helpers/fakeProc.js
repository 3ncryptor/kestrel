// Builds a throwaway /proc + /etc tree on disk so the Linux adapter can be tested on any OS.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BOOT_TIME_SEC = 1759000000;

function statLine({ pid, comm, state = 'S', ppid = 1, utime = 0, stime = 0, starttime = 0, rssPages = 0 }) {
    // Field layout from proc(5): everything after "(comm)" is space separated.
    const afterComm = [
        state, ppid, pid, pid, 0, -1, 4194560, 100, 0, 0, 0,
        utime, stime, 0, 0, 20, 0, 1, 0, starttime, 1000000, rssPages, '18446744073709551615',
    ];
    return `${pid} (${comm}) ${afterComm.join(' ')}\n`;
}

function statusText({ comm, uid = 1000 }) {
    return `Name:\t${comm}\nUmask:\t0022\nState:\tS (sleeping)\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nGid:\t${uid}\t${uid}\t${uid}\t${uid}\n`;
}

/**
 * @param {{ processes: Array<any>, meminfo?: string, tcp?: string, tcp6?: string, passwd?: string }} spec
 * Each process: { pid, comm, cmdline?: string[], uid?, ..statLine fields, sockets?: number[], vanished?: boolean }
 */
function createFakeRoot(spec) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-proc-'));
    const proc = path.join(root, 'proc');
    const etc = path.join(root, 'etc');
    fs.mkdirSync(path.join(proc, 'net'), { recursive: true });
    fs.mkdirSync(etc, { recursive: true });

    for (const p of spec.processes) {
        const dir = path.join(proc, String(p.pid));
        fs.mkdirSync(path.join(dir, 'fd'), { recursive: true });
        if (p.vanished) continue; // directory listed, but files gone: the process exited mid-scan
        fs.writeFileSync(path.join(dir, 'stat'), statLine(p));
        fs.writeFileSync(path.join(dir, 'status'), statusText(p));
        fs.writeFileSync(path.join(dir, 'cmdline'), p.cmdline ? `${p.cmdline.join('\0')}\0` : '');
        for (const [i, inode] of (p.sockets || []).entries()) fs.symlinkSync(`socket:[${inode}]`, path.join(dir, 'fd', String(10 + i)));
    }

    fs.writeFileSync(path.join(proc, 'stat'), `cpu  100 0 100 800 0 0 0 0 0 0\nbtime ${BOOT_TIME_SEC}\n`);
    fs.writeFileSync(path.join(proc, 'meminfo'), spec.meminfo ?? 'MemTotal:       16384000 kB\nMemFree:         1024000 kB\nMemAvailable:    8192000 kB\nSwapTotal:       2048000 kB\nSwapFree:        1024000 kB\n');
    fs.writeFileSync(path.join(proc, 'net', 'tcp'), spec.tcp ?? TCP_HEADER);
    fs.writeFileSync(path.join(proc, 'net', 'tcp6'), spec.tcp6 ?? TCP_HEADER);
    fs.writeFileSync(path.join(etc, 'passwd'), spec.passwd ?? 'root:x:0:0:root:/root:/bin/bash\nalice:x:1000:1000::/home/alice:/bin/bash\n');

    return {
        root,
        procRoot: proc,
        etcRoot: etc,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

const TCP_HEADER = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n';

module.exports = { createFakeRoot, statLine, TCP_HEADER, BOOT_TIME_SEC };
