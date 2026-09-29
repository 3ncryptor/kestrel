// Initial state and constants for the store contract (BUILD_PLAN §6.1).

const HISTORY_CAPACITY = 240; // one sample per tick → the cpu box graph shows the last 4 minutes
const MANAGED_MEM_CAPACITY = 120; // one sample per 5 s → the last 10 minutes
const MAX_FILTER_LENGTH = 200;

// M2b: one btop-style dashboard (the Overview/Monitor screens were dropped at the M2 review).
const SCREENS = Object.freeze(['dashboard']);
const MONITOR_VIEWS = Object.freeze(['table', 'tree']);
const FOCUS_BOXES = Object.freeze(['proc', 'managed', 'ports']);
const STACK_PHASES = Object.freeze(['idle', 'starting', 'running', 'stopping', 'stopped']);
const SORT_KEYS = Object.freeze(['cpu', 'mem', 'pid', 'name', 'user']);
const DEFAULT_SORT_DIR = Object.freeze({ cpu: 'desc', mem: 'desc', pid: 'asc', name: 'asc', user: 'asc' });
const DEFAULT_THRESHOLDS = Object.freeze({ cpu: [50, 80], memMB: [500, 1500] });

/** @returns {import('./types').StackState} */
function createStackState(fields = {}) {
    return { name: null, source: null, path: null, errors: [], warnings: [], scripts: null, phase: 'idle', stopProgress: {}, ...fields };
}

// Every event the store emits (BUILD_PLAN §6.2). `managed:ready` is reserved for M3 readiness checks.
const STORE_EVENTS = Object.freeze([
    'change', 'stats:update', 'processes:update', 'ports:update', 'ui:update', 'alert', 'collector:error',
    'managed:status', 'managed:log', 'managed:ready', 'managed:started', 'managed:crashed',
    'managed:restarting', 'managed:killed',
]);

/**
 * @param {{ meta?: Partial<import('./types').Meta>, thresholds?: import('./types').Thresholds }} [options]
 * @returns {import('./types').KestrelState}
 */
function createInitialState({ meta = {}, thresholds = DEFAULT_THRESHOLDS } = {}) {
    return {
        meta: {
            version: '0.0.0',
            platform: process.platform,
            arch: process.arch,
            hostname: '',
            isRoot: false,
            startedAt: Date.now(),
            configPath: null,
            configSource: null,
            ...meta,
        },
        settings: { thresholds },
        system: {
            cpuPercent: null,
            cores: [],
            load: [0, 0, 0],
            memUsedMB: null,
            memTotalMB: null,
            memCachedMB: null,
            swapUsedMB: null,
            swapTotalMB: null,
            uptimeSec: 0,
        },
        history: { cpu: [], mem: [] },
        processes: [],
        topConsumers: [],
        ports: { items: [], partial: false, updatedAt: null },
        managed: [],
        stack: createStackState(),
        orphans: [],
        alerts: [],
        ui: {
            screen: 'dashboard',
            monitorView: 'table',
            focus: 'proc',
            selectedPid: null,
            sortBy: 'cpu',
            sortDir: 'desc',
            filterQuery: '',
            collapsedPids: [],
            selectedManagedId: null,
            logFilter: '',
            logFollow: true,
            toast: null,
        },
        errors: {},
    };
}

/**
 * Defaults for a managed entry; the process manager fills in the live fields.
 * @param {{ id: string } & Partial<import('./types').ManagedEntry>} fields
 * @returns {import('./types').ManagedEntry}
 */
function createManagedEntry(fields) {
    return {
        cmd: null,
        cwd: null,
        status: 'idle',
        pid: null,
        startedAt: null,
        restartCount: 0,
        exitCode: null,
        signal: null,
        nextRestartAt: null,
        restart: 'on-failure',
        ready: null,
        blockedBy: [],
        resources: null,
        memHistory: [],
        leakSuspect: false,
        dependsOn: [],
        logCount: 0,
        ...fields,
    };
}

module.exports = {
    createInitialState,
    createManagedEntry,
    createStackState,
    STACK_PHASES,
    HISTORY_CAPACITY,
    MANAGED_MEM_CAPACITY,
    MAX_FILTER_LENGTH,
    SCREENS,
    MONITOR_VIEWS,
    FOCUS_BOXES,
    SORT_KEYS,
    DEFAULT_SORT_DIR,
    DEFAULT_THRESHOLDS,
    STORE_EVENTS,
};
