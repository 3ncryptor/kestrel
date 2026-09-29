import type { Metadata } from 'next';
import { DocPage } from '@/components/docs/DocPage';
import { DocsShell } from '@/components/docs/DocsShell';
import { changelogDoc, pageFor } from '@/lib/pages';

const page = pageFor('/changelog');
export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.href } };

export default async function Changelog() {
    const doc = await changelogDoc();
    return (
        <DocsShell>
            <div className="changelog">
                <DocPage href="/changelog" html={doc.html} toc={doc.toc.filter((t) => t.depth === 2)} />
            </div>
        </DocsShell>
    );
}
