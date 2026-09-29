import { expect, test } from 'bun:test';
import { KEYMAP, keyId, resolveKey, footerFor, helpFor } from '../../ui/keymap.js';

const env = { managerAvailable: true };

test('every box shows at most five border keys (Hick\'s law, UI_SPEC §2)', () => {
    for (const context of Object.keys(KEYMAP)) expect(footerFor(context, env).length).toBeLessThanOrEqual(5);
});

test('no key is bound twice within a context', () => {
    for (const [context, entries] of Object.entries(KEYMAP)) {
        const keys = entries.flatMap((e) => e.keys);
        expect(new Set(keys).size, context).toBe(keys.length);
    }
});

test('x means stop/kill everywhere it appears', () => {
    for (const entries of Object.values(KEYMAP)) {
        const x = entries.find((e) => e.keys.includes('x'));
        if (x) expect(x.action).toMatch(/(^|:)(kill|stop)/);
    }
});

test('box keys win over global keys, and global keys work everywhere', () => {
    expect(resolveKey('proc.table', 's', env)).toBe('sort:next');
    expect(resolveKey('ports', 'x', env)).toBe('kill:port');
    expect(resolveKey('ports', 'return', env)).toBe('ports:jump');
    expect(resolveKey('proc.table', 'tab', env)).toBe('focus:next');
    expect(resolveKey('ports', 'q', env)).toBe('quit');
    expect(resolveKey('proc.table', 'nonsense', env)).toBeNull();
});

test('the table shows the spec\'s five border keys', () => {
    expect(footerFor('proc.table', env).map((e) => e.label)).toEqual(['↑↓ select', '/ filter', 's sort', 'x kill', '⏎ info']);
});

test('keyId normalizes OpenTUI key events', () => {
    expect(keyId({ name: 's', sequence: 's' })).toBe('s');
    expect(keyId({ name: 's', sequence: 'S', shift: true })).toBe('S');
    expect(keyId({ name: 'c', ctrl: true, sequence: '\u0003' })).toBe('ctrl+c');
    expect(keyId({ name: 'up', sequence: '\u001b[A' })).toBe('up');
    expect(keyId({ name: 'return', sequence: '\r' })).toBe('return');
    expect(keyId({ name: 'tab', sequence: '\t' })).toBe('tab');
    expect(keyId({ name: 'slash', sequence: '/' })).toBe('/');
});

test('help lists the focused box first, then global keys', () => {
    const groups = helpFor('proc.table', env);
    expect(groups[0].title).toBe('Processes');
    expect(groups.at(-1).title).toBe('Everywhere');
    expect(groups[0].entries.some((e) => e.label.includes('renice'))).toBe(true);
    expect(helpFor('ports', env)[0].title).toBe('Ports');
});

test('managed: process keys in its own border, log keys in the logs panel border (M3)', () => {
    expect(footerFor('managed', env).map((e) => e.label)).toEqual(['s start', 'x stop', 'r restart', 'a start all']);
    expect(footerFor('managed', env, 'logs').map((e) => e.label)).toEqual(['f follow', '/ search', 'v all / one', 'PgUp older', 'PgDn newer']);
    expect(resolveKey('managed', 's', env)).toBe('managed:start');
    expect(resolveKey('managed', 'G', env)).toBe('logs:bottom');
});

test('manager-only keys are hidden in kestrel sm', () => {
    const sm = { managerAvailable: false };
    expect(resolveKey('proc.table', 'L', env)).toBe('logs:failed');
    expect(resolveKey('proc.table', 'L', sm)).toBeNull();
    expect(helpFor('proc.table', sm).at(-1).entries.some((e) => e.action === 'logs:failed')).toBe(false);
});
