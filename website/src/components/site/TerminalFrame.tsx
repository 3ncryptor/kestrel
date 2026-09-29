import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { type Frame, type Span, spanStyle } from '@/lib/frames';

/** Cascadia Mono's advance width in em: the frame is sized so `cols` cells fill its container exactly. */
const CELL_EM = 0.586;

// Rows and spans are positional (a row is always row N), so their index is the right key. A row whose
// spans array did not change between frames is the same object, so memo skips it.
const Row = memo(function Row({ spans }: { spans: Span[] }) {
    return (
        <div className="flex whitespace-pre">
            {spans.map((span, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional within a row
                <span key={i} className="inline-block shrink-0 overflow-hidden" style={spanStyle(span)}>
                    {span.text}
                </span>
            ))}
        </div>
    );
});

/**
 * One real Kestrel frame. It scales with its container (container query units), so the same frame fits a
 * phone and a wide screen without reflowing a single cell.
 */
export function TerminalFrame({ frame, className, overlay }: { frame: Frame; className?: string; overlay?: ReactNode }) {
    return (
        <div className={cn('@container w-full', className)}>
            <div
                aria-hidden="true"
                data-terminal-frame=""
                className="relative select-none font-mono text-k-text leading-[1.2]"
                style={{ width: `${frame.cols}ch`, fontSize: `min(18px, calc(100cqi / ${frame.cols * CELL_EM}))` }}
            >
                {frame.lines.map((line, row) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: row N is always row N of the terminal
                    <Row key={row} spans={line} />
                ))}
                {overlay}
            </div>
        </div>
    );
}
