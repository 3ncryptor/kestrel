import type { Metadata } from 'next';
import { DocPage } from '@/components/docs/DocPage';
import { KeysTable } from '@/components/docs/KeysTable';
import { keyGroups, pageFor } from '@/lib/pages';

const page = pageFor('/docs/keys');
export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.href } };

export default function Keys() {
    const groups = keyGroups();
    return (
        <DocPage href="/docs/keys" toc={groups.map((g) => ({ id: g.context, text: g.title, depth: 2 as const }))}>
            <KeysTable groups={groups} />
        </DocPage>
    );
}
