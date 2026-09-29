import { cn } from '@/lib/cn';
import { type Level, wordmark } from '@/lib/wordmark';

/** One cell's pitch in viewBox units, and the cell inside it (the rest is the gap). */
const PITCH = 10;
const CELL = 8.4;
const RADIUS = 1.8;
/** The fill sweeps left to right like a meter filling: this much delay per column. */
const COLUMN_DELAY_MS = 28;

const FILL: Record<Level, string> = {
    low: 'var(--k-green)',
    mid: 'var(--k-yellow)',
    high: 'var(--k-peach)',
    max: 'var(--k-red)',
};

const { cols, rows, cells } = wordmark();

/**
 * "KESTREL" in meter cells, coloured by Kestrel's own meter bands. Pure SVG and CSS (the `wm-` rules in
 * globals.css): it fills in column by column from the first paint, a few empty cells flicker, and the pointer
 * leaves a fading trail. Decoration: the caller provides the text.
 */
export function MeterWordmark({ className }: { className?: string }) {
    return (
        <svg viewBox={`0 0 ${cols * PITCH} ${rows * PITCH}`} className={cn('wm block h-auto w-full', className)} aria-hidden="true" focusable="false">
            {cells.map((cell) => (
                <rect
                    key={`${cell.col}-${cell.row}`}
                    x={cell.col * PITCH}
                    y={cell.row * PITCH}
                    width={CELL}
                    height={CELL}
                    rx={RADIUS}
                    className={cell.level ? 'wm-lit' : cell.flicker !== undefined ? 'wm-empty wm-flicker' : 'wm-empty'}
                    style={
                        cell.level
                            ? { fill: FILL[cell.level], animationDelay: `${cell.col * COLUMN_DELAY_MS}ms` }
                            : cell.flicker !== undefined
                              ? { animationDelay: `${cell.flicker}s` }
                              : undefined
                    }
                />
            ))}
        </svg>
    );
}
