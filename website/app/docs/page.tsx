import type { Metadata } from 'next';
import { DocPage } from '@/components/docs/DocPage';
import { guideDoc, pageFor } from '@/lib/pages';

const page = pageFor('/docs');
export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.href } };

export default async function Guide() {
    const doc = await guideDoc();
    return <DocPage href="/docs" html={doc.html} toc={doc.toc} />;
}
