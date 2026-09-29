// Every key binding, per focused box (UI_SPEC §5). The border hints and the help overlay are generated
// from this table, so what the user reads and what the keys do can never drift apart.

const k = (keys, label, action, options = {}) => ({ keys, label, action, footer: false, panel: 'box', requires: null, ...options });
const footer = { footer: true };
// While the managed box has focus, the big panel shows logs; these hints go in ITS border.
const logsFooter = { footer: true, panel: 'logs' };

/** Keys shared by the table and tree views of the proc box. */
const PROC_COMMON = [
    k(['S'], 'S reverse sort', 'sort:reverse'),
    k(['X'], 'X force kill (SIGKILL)', 'kill:force'),
    k(['r'], 'r renice', 'renice'),
    k(['pageup'], 'PgUp page up', 'move:pageUp'),
    k(['pagedown'], 'PgDn page down', 'move:pageDown'),
    k(['home'], 'Home first row', 'move:first'),
    k(['end'], 'End last row', 'move:last'),
];

export const KEYMAP = Object.freeze({
    global: [
        k(['?'], '? help', 'help:open'),
        k(['q', 'ctrl+c'], 'q quit', 'quit'),
        k(['escape'], 'Esc back', 'back'),
        k(['tab'], '⇥ next box', 'focus:next'),
        k(['L'], 'L logs of the failed process', 'logs:failed', { requires: 'manager' }),
    ],
    'proc.table': [
        k(['up', 'down', 'k', 'j'], '↑↓ select', 'move:line', footer),
        k(['/'], '/ filter', 'filter:open', footer),
        k(['s'], 's sort', 'sort:next', footer),
        k(['x'], 'x kill', 'kill', footer),
        k(['return'], '⏎ info', 'drawer:open', footer),
        k(['t'], 't tree view', 'view:tree'),
        ...PROC_COMMON,
    ],
    'proc.tree': [
        k(['up', 'down', 'k', 'j'], '↑↓ select', 'move:line', footer),
        k(['left', 'right'], '←→ fold', 'tree:fold', footer),
        k(['/'], '/ filter', 'filter:open', footer),
        k(['x'], 'x kill', 'kill', footer),
        k(['t'], 't flat view', 'view:table', footer),
        k(['s'], 's sort', 'sort:next'),
        k(['return'], '⏎ info', 'drawer:open'),
        ...PROC_COMMON,
    ],
    // The ports box is narrow: its most useful keys come first so they fit in the border.
    ports: [
        k(['x'], 'x kill owner', 'kill:port', footer),
        k(['return'], '⏎ jump', 'ports:jump', footer),
        k(['up', 'down', 'k', 'j'], '↑↓ select', 'move:line', footer),
        k(['/'], '/ filter', 'filter:open', footer),
        k(['tab'], '⇥ next box', 'focus:next', footer),
    ],
    // The managed box (M3). Its border shows the process keys; the logs panel shows the log keys.
    managed: [
        k(['s'], 's start', 'managed:start', footer),
        k(['x'], 'x stop', 'managed:stop', footer),
        k(['r'], 'r restart', 'managed:restart', footer),
        k(['a'], 'a start all', 'stack:start', footer),
        k(['up', 'down', 'k', 'j'], '↑↓ select', 'managed:move'),
        k(['X'], 'X stop all', 'stack:stop'),
        k(['return'], '⏎ show in proc (or pick scripts)', 'managed:enter'),
        k(['n'], 'n new process', 'managed:new'),
        k(['e'], 'e env', 'managed:env'),
        k(['w'], 'w save to kestrel.json', 'managed:save'),
        k(['f'], 'f follow', 'logs:follow', logsFooter),
        k(['/'], '/ search', 'logs:search', logsFooter),
        k(['v'], 'v all / one', 'logs:scope', logsFooter),
        k(['pageup'], 'PgUp older', 'logs:pageUp', logsFooter),
        k(['pagedown'], 'PgDn newer', 'logs:pageDown', logsFooter),
        k(['g', 'home'], 'g oldest', 'logs:top'),
        k(['G', 'end'], 'G newest', 'logs:bottom'),
    ],
    drawer: [
        k(['x'], 'x kill', 'kill', footer),
        k(['r'], 'r renice', 'renice', footer),
        k(['escape', 'return'], 'Esc close', 'drawer:close', footer),
    ],
    help: [k(['escape', '?', 'q'], 'Esc close', 'help:close', footer)],
});

const CONTEXT_TITLES = {
    'proc.table': 'Processes', 'proc.tree': 'Processes (tree)', managed: 'Managed processes and logs', ports: 'Ports', drawer: 'Details', help: 'Help',
};

const available = (entry, env) => entry.requires !== 'manager' || env.managerAvailable;

const PRINTABLE = /^[\x20-\x7e]$/;

/** OpenTUI KeyEvent → the id used in KEYMAP ("s", "S", "?", "ctrl+c", "up", "return", "tab", …). */
export function keyId(key) {
    if (key.ctrl) return `ctrl+${key.name}`;
    if (key.sequence && PRINTABLE.test(key.sequence)) return key.sequence;
    return key.name;
}

/** The action bound to `id` in `context` (falling back to global keys), or null. */
export function resolveKey(context, id, env) {
    for (const scope of [KEYMAP[context] || [], KEYMAP.global]) {
        const entry = scope.find((e) => e.keys.includes(id) && available(e, env));
        if (entry) return entry.action;
    }
    return null;
}

/** At most five hints for a bottom border: the focused box's, or (`panel: 'logs'`) the logs panel's. */
export function footerFor(context, env, panel = 'box') {
    return (KEYMAP[context] || []).filter((e) => e.footer && e.panel === panel && available(e, env)).slice(0, 5);
}

export function helpFor(context, env) {
    const own = (KEYMAP[context] || []).filter((e) => available(e, env));
    const global = KEYMAP.global.filter((e) => available(e, env));
    return [
        ...(own.length ? [{ title: CONTEXT_TITLES[context] || context, entries: own }] : []),
        { title: 'Everywhere', entries: global },
    ];
}
