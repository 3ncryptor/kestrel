'use client';

import { useEffect } from 'react';
import { copyText } from '@/components/site/InstallCommand';

const COPIED_MS = 1400;

/**
 * Adds a copy button to every highlighted code block in the docs (the rendered markdown is static HTML,
 * so the buttons are attached once it is on the page).
 */
export function CodeCopy() {
    useEffect(() => {
        const blocks = [...document.querySelectorAll<HTMLPreElement>('.docs-prose pre[data-code]')];
        const buttons = blocks.map((pre) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'code-copy';
            button.textContent = 'copy';
            button.setAttribute('aria-label', 'Copy this code');
            button.addEventListener('click', () => {
                copyText(pre.dataset.code ?? '', 'Code');
                button.textContent = 'copied';
                setTimeout(() => {
                    button.textContent = 'copy';
                }, COPIED_MS);
            });
            pre.append(button);
            return button;
        });
        return () => {
            for (const b of buttons) b.remove();
        };
    }, []);
    return null;
}
