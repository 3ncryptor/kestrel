import type { Metadata } from 'next';
import { DocPage } from '@/components/docs/DocPage';
import { configDoc, pageFor } from '@/lib/pages';

const page = pageFor('/docs/config');
export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.href } };

export default async function Config() {
    const doc = await configDoc();
    return <DocPage href="/docs/config" html={doc.html} toc={doc.toc} />;
}
