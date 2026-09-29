// Small building blocks shared by every box.
import { useTheme } from '../theme/context.js';
import { paint } from '../theme/paint.js';
import { STATUS_GLYPHS } from '../theme/tokens.js';

/** A span painted with a semantic role. */
export function Tone({ role = 'primary', bold = false, children }) {
    const theme = useTheme();
    return <span {...paint(theme, role, { bold })}>{children}</span>;
}

/** Glyph + label: color is never the only signal (UI_SPEC §3.4). */
export function StatusGlyph({ status, label }) {
    const entry = STATUS_GLYPHS[status] || STATUS_GLYPHS.idle;
    return (
        <>
            <Tone role={entry.state}>{entry.glyph}</Tone>
            {label ? <Tone role="secondary"> {label}</Tone> : null}
        </>
    );
}
