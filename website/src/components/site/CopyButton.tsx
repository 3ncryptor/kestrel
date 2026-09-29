'use client';

import { copyText } from './InstallCommand';

/** A small copy button for a command shown next to it. */
export function CopyButton({ text }: { text: string }) {
    return (
        <button
            type="button"
            onClick={() => copyText(text)}
            aria-label={`Copy: ${text}`}
            className="shrink-0 rounded-md px-2 py-1 font-mono text-k-muted text-xs transition-colors hover:bg-white/[0.07] hover:text-k-text active:scale-95"
        >
            copy
        </button>
    );
}
