import type { ReactNode } from 'react';
import { DOC_PAGES } from '@/lib/pages';
import { DocsNav } from './DocsNav';

/** The docs layout: a sticky sidebar and the page. */
export function DocsShell({ children }: { children: ReactNode }) {
    return (
        <div className="mx-auto grid max-w-7xl gap-10 px-6 pt-28 pb-24 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="lg:block">
                <div className="lg:sticky lg:top-24">
                    <DocsNav pages={DOC_PAGES} />
                </div>
            </aside>
            <div className="min-w-0">{children}</div>
        </div>
    );
}
