// Supervises ONE managed process: spawn, readiness, restart policy and stop (BUILD_PLAN §8.4).
//
//  idle ─start→ starting ─ready→ running        starting ─timeout→ unready (still running)
//  exit ─policy→ restarting ─delay→ starting    too many crashes → errored     exit 0 → exited
//  stop → stopping → stopped                    dependency failed → blocked (set by the orchestrator)
//
// Commands run through the user's shell (`shell: true`): they are the user's own, same trust as `npm run`.
const { createLogBuffer } = require('./logBuffer');
const { createLogFile } = require('./logFile');
const { createProbe } = require('./readiness');
const { resolveEnv } = require('./env');
const { signalGroup, groupAlive, signalPgid } = require('./groups');

class Supervisor {
    /**
     * @param {any} def  normalized process definition (core/config/schema.js), plus ad-hoc defaults
     * @param {any} ctx  { publish, entry, emit, alert, dismissAlert, spawnFn, computeDelay, stableRunMs, stdioDrainMs,
     *                    readinessIntervalMs, autoRestart, maxLogLines, logDir, logFlushMs, onChildrenChanged }
     */
    constructor(def, ctx) {
        this.def = def;
        this.id = def.name;
        this.ctx = ctx;
        this.logs = createLogBuffer({ maxLines: ctx.maxLogLines });
        this.logFile = ctx.logDir
            ? createLogFile({ dir: ctx.logDir, id: this.id, flushMs: ctx.logFlushMs, onError: (err) => this.onLogFileError(err) })
            : null;
        /** @type {any} the running ChildProcess (or a test double from spawnFn) */
        this.child = null;
        /** @type {number|null} group of the last child, kept until the group is empty */
        this.pgid = null;
        /** @type {Promise<void>} resolves once the current child is fully finished */
        this.done = Promise.resolve();
        /** @type {(code: number|null, signal: string|null) => void} */
        this.finalize = () => {};
        /** @type {NodeJS.Timeout|undefined} */
        this.restartTimer = undefined;
        /** @type {NodeJS.Timeout|undefined} */
        this.killTimer = undefined;
        /** @type {{ start: Function, feedLine: (text: string) => void, cancel: Function }|null} */
        this.probe = null;
        this.stopping = false;
        this.startedAt = 0;
        this.restartCount = 0;
        this.crashStreak = 0;
        this.ownEnv = { ...(def.env || {}) };
    }

    get running() {
        return this.child !== null;
    }

    readyInfo(ok) {
        return this.def.ready ? { kind: this.def.ready.kind, target: this.def.ready.target, ok } : null;
    }

    // ---------- commands ----------

    /** Starts the process unless it is already running. A manual start forgives earlier crashes. */
    start() {
        if (this.child) return;
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        this.crashStreak = 0;
        this.ctx.dismissAlert(`errored:${this.id}`);
        this.launch();
    }

    block(deps) {
        this.ctx.publish({ status: 'blocked', blockedBy: deps, pid: null });
    }

    async stop() {
        this.cancelProbe();
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
            this.ctx.publish({ status: 'stopped', pid: null, nextRestartAt: null });
            this.ctx.emit('managed:killed', { id: this.id });
            return;
        }
        if (!this.child) {
            // The main process is gone, but its group may still have members being swept.
            if (this.pgid !== null && groupAlive(this.pgid)) signalPgid(this.pgid, 'SIGKILL');
            return;
        }
        const { child, done } = this;
        if (!this.stopping) {
            this.stopping = true;
            this.ctx.publish({ status: 'stopping' });
            signalGroup(child, this.def.stopSignal || 'SIGTERM');
            this.killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), this.def.stopTimeoutMs);
        }
        await done;
    }

    shutdownSync() {
        clearTimeout(this.restartTimer);
        clearTimeout(this.killTimer);
        this.cancelProbe();
        if (this.child) signalGroup(this.child, 'SIGTERM');
        else if (this.pgid !== null) signalPgid(this.pgid, 'SIGTERM');
        if (this.logFile) this.logFile.flushSync();
    }

    // ---------- lifecycle ----------

    launch() {
        let resolved;
        try {
            resolved = resolveEnv(this.def);
        } catch (err) {
            this.appendLog(`[kestrel] ${err.message}`);
            this.ctx.publish({ status: 'errored', pid: null });
            return;
        }
        resolved.warnings.forEach((w) => this.appendLog(`[kestrel] ${w}`));
        this.ownEnv = resolved.own;

        const child = this.ctx.spawnFn(this.def.cmd, {
            shell: true,
            detached: true,
            cwd: this.def.cwd,
            env: resolved.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.child = child;
        this.pgid = child.pid ?? null;
        this.stopping = false;
        this.startedAt = Date.now();
        child.stdout.on('data', (chunk) => this.onOutput(chunk, 'stdout'));
        child.stderr.on('data', (chunk) => this.onOutput(chunk, 'stderr'));
        this.watchTermination(child);
        child.on('error', (err) => this.onChildError(child, err));

        this.ctx.publish({
            pid: child.pid ?? null,
            status: this.def.ready ? 'starting' : 'running',
            startedAt: this.startedAt,
            restartCount: this.restartCount,
            exitCode: null,
            signal: null,
            nextRestartAt: null,
            blockedBy: [],
            ready: this.readyInfo(false),
        });
        this.ctx.emit('managed:started', this.ctx.entry());
        if (this.def.ready) this.startProbe();
        this.ctx.onChildrenChanged();
    }

    startProbe() {
        const ready = this.def.ready;
        this.probe = createProbe(ready, {
            intervalMs: this.ctx.readinessIntervalMs,
            onReady: (info) => {
                this.probe = null;
                this.ctx.publish({ status: 'running', ready: this.readyInfo(true) });
                this.ctx.emit('managed:ready', { id: this.id, ...info });
            },
            onTimeout: () => {
                this.probe = null;
                this.appendLog(`[kestrel] not ready after ${Math.round(ready.timeoutMs / 1000)}s (${ready.kind} ${ready.target})`);
                this.ctx.publish({ status: 'unready', ready: this.readyInfo(false) });
            },
        });
        this.probe.start();
    }

    cancelProbe() {
        if (this.probe) this.probe.cancel();
        this.probe = null;
    }

    /** Resolves `this.done` once, after the final output was logged: on "close", or shortly after "exit". */
    watchTermination(child) {
        let settled = false;
        let drainTimer = null;
        let resolveDone;
        this.done = new Promise((resolve) => (resolveDone = resolve));
        this.finalize = (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(drainTimer);
            this.onExit(child, code, signal);
            resolveDone();
        };
        child.once('exit', (code, signal) => {
            drainTimer = setTimeout(() => this.finalize(code, signal), this.ctx.stdioDrainMs);
        });
        child.once('close', (code, signal) => this.finalize(code, signal));
    }

    onOutput(chunk, stream) {
        this.emitLines(this.logs.write(chunk, stream));
    }

    onChildError(child, err) {
        if (this.child !== child) return;
        this.appendLog(`[kestrel] ${err.message}`);
        // If spawning itself failed there is no process, and no 'exit' event will follow.
        if (child.pid === undefined) this.finalize(null, null);
    }

    onExit(child, exitCode, signal) {
        if (this.child !== child) return; // stale event from a previous run
        this.child = null;
        clearTimeout(this.killTimer);
        this.cancelProbe();
        this.emitLines(this.logs.flush());
        this.sweepLeftovers();
        this.ctx.onChildrenChanged();

        if (this.stopping) {
            this.stopping = false;
            if (this.logFile) this.logFile.flushSync(); // a stopped process's last lines are on disk
            this.ctx.publish({ status: 'stopped', pid: null, exitCode, signal });
            this.ctx.emit('managed:killed', { id: this.id });
            return;
        }
        const failed = exitCode !== 0;
        if (!failed && this.def.restart !== 'always') {
            this.appendLog('[kestrel] exited cleanly (code 0), not restarting');
            this.ctx.publish({ status: 'exited', pid: null, exitCode, signal });
            return;
        }
        if (failed) this.recordCrash(exitCode, signal);
        const restart = this.ctx.autoRestart && (this.def.restart === 'always' || (failed && this.def.restart === 'on-failure'));
        if (!restart) return;
        if (this.crashStreak > this.def.maxRestarts) {
            this.giveUp(exitCode);
            return;
        }
        this.scheduleRestart(failed);
    }

    recordCrash(exitCode, signal) {
        const ranFor = Date.now() - this.startedAt;
        this.crashStreak = ranFor >= this.ctx.stableRunMs ? 1 : this.crashStreak + 1;
        this.appendLog(`[kestrel] crashed (code ${exitCode}, signal ${signal})`);
        this.ctx.publish({ status: 'crashed', pid: null, exitCode, signal });
        this.ctx.emit('managed:crashed', { id: this.id, exitCode, signal });
    }

    giveUp(exitCode) {
        const message = `${this.id} stopped after ${this.crashStreak} crashes (last exit ${exitCode}) · see its logs`;
        this.appendLog(`[kestrel] ${message}`);
        this.ctx.publish({ status: 'errored', pid: null, nextRestartAt: null });
        this.ctx.alert({ id: `errored:${this.id}`, level: 'danger', source: `managed:${this.id}`, message });
    }

    scheduleRestart(failed) {
        if (!failed) this.appendLog('[kestrel] exited (code 0), restarting (restart: always)');
        const attempt = Math.max(1, this.crashStreak);
        const delayMs = this.ctx.computeDelay(attempt);
        this.restartCount += 1;
        this.ctx.publish({ status: 'restarting', restartCount: this.restartCount, nextRestartAt: Date.now() + delayMs });
        this.ctx.emit('managed:restarting', { id: this.id, attempt, delayMs });
        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            if (!this.child) this.launch();
        }, delayMs);
    }

    /** Anything the main process left running in its group would be orphaned: stop it (SIGTERM → SIGKILL). */
    sweepLeftovers() {
        const pgid = this.pgid;
        if (pgid === null) return;
        if (!groupAlive(pgid)) {
            this.pgid = null;
            return;
        }
        this.appendLog('[kestrel] stopping processes it left running in the background');
        signalPgid(pgid, 'SIGTERM');
        const timer = setTimeout(() => {
            if (groupAlive(pgid)) signalPgid(pgid, 'SIGKILL');
            if (this.pgid === pgid) this.pgid = null;
        }, this.def.stopTimeoutMs);
        timer.unref();
    }

    // ---------- logs ----------

    emitLines(lines) {
        if (!lines.length) return;
        this.ctx.publish({});
        for (const line of lines) {
            if (this.logFile) this.logFile.write(line);
            if (this.probe && line.stream !== 'system') this.probe.feedLine(line.text);
            this.ctx.emit('managed:log', { id: this.id, line });
        }
    }

    appendLog(text) {
        this.emitLines([this.logs.append(text)]);
    }

    onLogFileError(err) {
        this.ctx.alert({ id: `logfile:${this.id}`, level: 'warn', source: `managed:${this.id}`, message: `${this.id}: saving logs stopped (${err.message})` });
    }
}

module.exports = { Supervisor };
