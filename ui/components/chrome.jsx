// Lines above the dashboard (failing sources, alerts) and the too-small screen (UI_SPEC §7).
import { useTheme } from '../theme/context.js';
import { paint } from '../theme/paint.js';
import { Tone } from './primitives.jsx';
import { MIN_WIDTH, MIN_HEIGHT } from '../logic/layout.js';
import { GLYPHS } from '../theme/tokens.js';

const MAX_ALERT_LINES = 2;

/** How many lines `Banners` will draw, so the dashboard can take the rest of the height. */
export function bannerCount(errors, alerts) {
    return Object.keys(errors).length + Math.min(MAX_ALERT_LINES, alerts.length);
}

/** One line per failing data source (S4) and per alert; the boxes below keep working. */
export function Banners({ errors, alerts }) {
    const theme = useTheme();
    const sources = Object.entries(errors);
    const shown = alerts.slice(0, MAX_ALERT_LINES);
    if (!sources.length && !shown.length) return null;
    return (
        <box flexDirection="column" paddingLeft={1}>
            {sources.map(([source, err]) => (
                <text key={source} {...paint(theme, 'warn')}>
                    {GLYPHS.alertWarn} {source} unavailable · {err.message} · run kestrel doctor
                </text>
            ))}
            {shown.map((a) => (
                <text key={a.id} {...paint(theme, a.level === 'danger' ? 'danger' : 'warn')}>
                    {a.level === 'danger' ? GLYPHS.alertDanger : GLYPHS.alertWarn} {a.message}{a.id.startsWith('errored:') ? ' · L show logs' : ''}
                </text>
            ))}
        </box>
    );
}

export function TooSmall({ width, height }) {
    return (
        <box width={width} height={height} justifyContent="center" alignItems="center">
            <text>
                <Tone role="warn">
                    Kestrel needs {MIN_WIDTH}×{MIN_HEIGHT} — currently {width}×{height}
                </Tone>
            </text>
        </box>
    );
}
