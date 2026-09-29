import { expect, test } from 'bun:test';
import * as f from '../../ui/logic/format.js';
import { breakpoint, processColumns, windowStart } from '../../ui/logic/layout.js';
import { dialogForTarget, dialogReducer, confirmationFor, canSubmit } from '../../ui/logic/dialog.js';

// ---------- formatting (UI_SPEC §9) ----------

test('CPU, memory, counts and unknown values', () => {
    expect(f.formatCpu(3.14)).toBe('3.1');
    expect(f.formatCpu(100)).toBe('100.0');
    expect(f.formatCpu(null)).toBe('—');
    expect(f.formatMem(90.4)).toBe('90 MB');
    expect(f.formatMem(1228.8)).toBe('1.2 GB');
    expect(f.formatMem(undefined)).toBe('—');
    expect(f.formatCount(9999)).toBe('9999');
    expect(f.formatCount(12408)).toBe('12,408');
    expect(f.formatPercent(41.6)).toBe('42%');
});

test('durations use the two largest units', () => {
    expect(f.formatDuration(0)).toBe('0s');
    expect(f.formatDuration(45)).toBe('45s');
    expect(f.formatDuration(12 * 60 + 3)).toBe('12m 3s');
    expect(f.formatDuration(3 * 3600 + 4 * 60 + 9)).toBe('3h 4m');
    expect(f.formatDuration(3 * 86400 + 4 * 3600)).toBe('3d 4h');
});

test('truncation: names at the end, paths in the middle keeping the last part', () => {
    expect(f.truncateEnd('Chrome Helper (Renderer)', 20)).toBe('Chrome Helper (Rend…');
    expect(f.truncateEnd('node', 20)).toBe('node');
    expect(f.truncateEnd('anything', 0)).toBe('');
    expect(f.truncateMiddle('~/code/myapp/services/server', 16)).toBe('~/code/…/server');
    expect(f.truncateMiddle('/short', 20)).toBe('/short');
    expect(f.truncateMiddle('/a/averyveryverylongbasename', 10)).toBe('/a/averyv…');
});

test('padding helpers never overflow their width', () => {
    expect(f.padStart('42', 5)).toBe('   42');
    expect(f.padEnd('node', 6)).toBe('node  ');
    expect(f.padEnd('toolongvalue', 4)).toBe('too…');
});

test('clock format is HH:MM:SS', () => {
    expect(f.formatClock(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('03:04:05');
});


// ---------- layout ----------

test('breakpoints follow UI_SPEC §4.2', () => {
    expect(breakpoint(59, 30)).toBe('tooSmall');
    expect(breakpoint(80, 15)).toBe('tooSmall');
    expect(breakpoint(80, 24)).toBe('compact');
    expect(breakpoint(120, 40)).toBe('standard');
    expect(breakpoint(160, 50)).toBe('wide');
});

test('process columns: inline cpu meter everywhere, User/State from standard, Command when wide', () => {
    const keys = (bp, w) => processColumns(bp, w).map((c) => c.key);
    expect(keys('compact', 80)).toEqual(['pid', 'name', 'cpu', 'meter', 'mem']);
    expect(keys('standard', 120)).toEqual(['pid', 'name', 'user', 'cpu', 'meter', 'mem', 'state']);
    expect(keys('wide', 160)).toEqual(['pid', 'name', 'user', 'cpu', 'meter', 'mem', 'state', 'command']);
    for (const [bp, w] of [['compact', 80], ['standard', 120], ['wide', 160]]) {
        const total = processColumns(bp, w).reduce((s, c) => s + c.width + 1, 0);
        expect(total).toBeLessThanOrEqual(w);
    }
});

test('windowStart keeps the selected row visible', () => {
    expect(windowStart(0, 5, 10)).toBe(0);
    expect(windowStart(50, 100, 10)).toBe(45);
    expect(windowStart(99, 100, 10)).toBe(90);
});

// ---------- dialogs (UI_SPEC §6.5) ----------

const proc = { pid: 812, name: 'node', user: 'alice' };

test('each safety tier opens the matching dialog', () => {
    expect(dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'own', reason: '' } }).kind).toBe('confirm');
    expect(dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'system', reason: 'x' } }).kind).toBe('typeName');
    expect(dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'managed', reason: 'x' } }).kind).toBe('managed');
    expect(dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'blocked', reason: 'pid 1 is protected' } }).kind).toBe('blocked');
    expect(dialogForTarget({ action: 'renice', process: proc, nice: 0, classification: { tier: 'own', reason: '' } }).kind).toBe('renice');
});

test('type-the-name dialogs can only be submitted with the exact name', () => {
    let d = dialogForTarget({ action: 'kill', signal: 'SIGKILL', process: { ...proc, name: 'WindowServer' }, classification: { tier: 'system', reason: '' } });
    expect(canSubmit(d)).toBe(false);
    for (const ch of 'Windo') d = dialogReducer(d, { type: 'type', char: ch });
    expect(d.typed).toBe('Windo');
    expect(canSubmit(d)).toBe(false);
    for (const ch of 'wServer') d = dialogReducer(d, { type: 'type', char: ch });
    expect(canSubmit(d)).toBe(true);
    expect(confirmationFor(d)).toEqual({ tier: 'system', typedName: 'WindowServer', pid: 812 });
    d = dialogReducer(d, { type: 'backspace' });
    expect(canSubmit(d)).toBe(false);
});

test('blocked dialogs never produce a confirmation', () => {
    const d = dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'blocked', reason: 'r' } });
    expect(canSubmit(d)).toBe(false);
    expect(confirmationFor(d)).toBeNull();
});

test('renice dialog prefills the current nice value and validates the range', () => {
    let d = dialogForTarget({ action: 'renice', process: proc, nice: 5, classification: { tier: 'own', reason: '' } });
    expect(d.typed).toBe('5');
    expect(canSubmit(d)).toBe(true);
    d = dialogReducer(d, { type: 'backspace' });
    for (const ch of '-21') d = dialogReducer(d, { type: 'type', char: ch });
    expect(canSubmit(d)).toBe(false);
    d = dialogReducer(d, { type: 'backspace' });
    expect(d.typed).toBe('-2');
    expect(canSubmit(d)).toBe(true);
    expect(confirmationFor(d)).toEqual({ tier: 'own', pid: 812 });
    expect(dialogReducer(d, { type: 'type', char: 'x' }).typed).toBe('-2', 'only digits and a leading minus');
});

test('cancel closes any dialog', () => {
    const d = dialogForTarget({ action: 'kill', signal: 'SIGTERM', process: proc, classification: { tier: 'own', reason: '' } });
    expect(dialogReducer(d, { type: 'cancel' })).toBeNull();
});

import { treeGuides, visiblePorts } from '../../ui/logic/layout.js';

test('treeGuides draws ├─ └─ │ connectors', () => {
    const rows = [
        { pid: 1, depth: 0 },
        { pid: 2, depth: 1 },
        { pid: 3, depth: 2 },
        { pid: 4, depth: 2 },
        { pid: 5, depth: 1 },
        { pid: 6, depth: 2 },
    ];
    expect(treeGuides(rows)).toEqual(['', '├─', '│ ├─', '│ └─', '└─', '  └─']);
});

test('visiblePorts filters by port, address or process name', () => {
    const items = [
        { port: 3000, address: '127.0.0.1', name: 'node' },
        { port: 5432, address: '*', name: 'postgres' },
    ];
    expect(visiblePorts(items, '').length).toBe(2);
    expect(visiblePorts(items, '543').map((p) => p.port)).toEqual([5432]);
    expect(visiblePorts(items, 'NODE').map((p) => p.port)).toEqual([3000]);
});

import { rowSegments } from '../../ui/components/tables.jsx';

test('a long managed id never widens the NAME column (review finding)', () => {
    const columns = [{ key: 'pid', label: 'PID', width: 7, align: 'right' }, { key: 'name', label: 'NAME', width: 30, align: 'left' }];
    const row = { pid: 812, name: 'node', managedId: 'a-very-long-managed-process-name-chosen-by-the-user-in-kestrel-json', cpu: 0, memMB: 0 };
    const text = rowSegments(row, columns, { selected: false, guide: '', thresholds: { cpu: [50, 80], memMB: [500, 1500] } }).map((s) => s.text).join('');
    // selection bar (2) + pid (7+1) + name (30) + trailing space (1)
    expect(text.length).toBe(2 + 8 + 30 + 1);
    expect(text).toContain('node');
    expect(text).toContain('◆a-very');
});

import { brailleGraph, blockGraph, gradientLevel, meterSegments } from '../../ui/logic/charts.js';

test('gradientLevel splits 0–100 into four bands (UI_SPEC §3.2)', () => {
    expect([0, 24.9, 25, 49.9, 50, 74.9, 75, 100].map(gradientLevel)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high', 'max', 'max']);
});

test('brailleGraph packs two samples per character and fills from the bottom', () => {
    // height 1 → 4 dot levels per column. 100% fills all four dots, 50% the bottom two.
    const [row] = brailleGraph([100, 50], 1, 1);
    // left column full (dots 1,2,3,7) + right column bottom two (dots 6,8) = 0x47 | 0xA0
    expect(row).toBe(String.fromCharCode(0x2800 + 0x47 + 0xa0));
    expect(brailleGraph([0, 0], 1, 1)[0]).toBe('⠀', 'zero is a blank braille cell');
});

test('brailleGraph spans several rows and keeps only the newest samples', () => {
    const rows = brailleGraph([100, 100, 25, 25], 2, 2); // 2 rows = 8 levels; 25% = 2 dots
    expect(rows.length).toBe(2);
    expect(rows[0]).toBe('⣿⠀', 'top row: full for 100%, empty for 25%');
    expect(rows[1]).toBe('⣿⣤', 'bottom row: full for 100%, two dots for 25%');
    expect(brailleGraph([], 3, 2)).toEqual(['⠀⠀⠀', '⠀⠀⠀'], 'no data yet (S1)');
    expect(brailleGraph([100, 100, 100, 100, 0, 0], 1, 1)[0]).toBe('⠀', 'only the newest 2 samples fit in one column');
});

test('blockGraph is the no-color fallback: one sample per column, 8 levels per row', () => {
    expect(blockGraph([100, 50, 0], 3, 1)).toEqual(['█▄ ']);
    expect(blockGraph([100], 1, 2)).toEqual(['█', '█']);
});

test('meterSegments colors each filled cell by its own position, like btop', () => {
    const segs = meterSegments(100, 8);
    expect(segs.map((s) => s.level)).toEqual(['low', 'mid', 'high', 'max']);
    expect(segs.map((s) => s.text).join('')).toBe('■■■■■■■■');
    const half = meterSegments(50, 8);
    expect(half.map((s) => [s.level, s.text])).toEqual([['low', '■■'], ['mid', '■■'], ['empty', '────']]);
    expect(meterSegments(0, 4)).toEqual([{ level: 'empty', text: '────' }]);
    expect(meterSegments(150, 4).map((s) => s.text).join('')).toBe('■■■■', 'clamped');
});

import { dashboardLayout } from '../../ui/logic/layout.js';

test('dashboardLayout tiles the terminal exactly: cpu across the top, left column, proc on the right', () => {
    for (const [w, h, cores, bp] of [[80, 24, 8, 'compact'], [120, 40, 8, 'standard'], [160, 50, 16, 'wide']]) {
        const l = dashboardLayout(w, h, cores, bp);
        expect(l.cpu.width).toBe(w);
        expect(l.left.width + l.proc.width).toBe(w);
        expect(l.cpu.height + l.proc.height).toBe(h);
        expect(l.mem.height + l.managed.height + l.ports.height).toBe(l.proc.height);
        expect(l.cpu.graphHeight).toBeGreaterThanOrEqual(1);
        expect(l.cpu.graphWidth).toBeGreaterThan(10);
        expect(l.cpu.coreCols * l.cpu.coreRows).toBeGreaterThanOrEqual(Math.min(cores, l.cpu.coreCols * l.cpu.coreRows));
    }
    expect(dashboardLayout(80, 24, 8, 'compact').cpu.height).toBe(5);
    expect(dashboardLayout(80, 24, 8, 'compact').left.width).toBe(26);
    const compact = dashboardLayout(80, 24, 8, 'compact').cpu;
    expect(compact.coreCols * compact.coreRows).toBeGreaterThanOrEqual(8); // no core hidden on an 8-core machine
    expect(dashboardLayout(160, 50, 16, 'wide').cpu.coreCols).toBeGreaterThan(1);
});

test('the managed box grows with its content, up to half the left column, and ports keeps 3 rows', () => {
    for (const [w, h, bp] of [[80, 24, 'compact'], [120, 40, 'standard'], [60, 16, 'compact']]) {
        for (const rows of [0, 2, 4, 30]) {
            const l = dashboardLayout(w, h, 8, bp, rows);
            expect(l.mem.height + l.managed.height + l.ports.height).toBe(l.proc.height);
            expect(l.ports.height).toBeGreaterThanOrEqual(3);
            expect(l.managed.height).toBeLessThanOrEqual(Math.floor(l.proc.height / 2));
        }
    }
    expect(dashboardLayout(120, 40, 8, 'standard', 0).managed.height).toBe(0);
    expect(dashboardLayout(120, 40, 8, 'standard', 4).managed.height).toBe(6);
});
