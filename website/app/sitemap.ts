import type { MetadataRoute } from 'next';
import { DOC_PAGES } from '@/lib/pages';
import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
    return [{ url: SITE.url, changeFrequency: 'weekly', priority: 1 }, ...DOC_PAGES.map((p) => ({ url: `${SITE.url}${p.href}`, changeFrequency: 'weekly' as const, priority: 0.7 }))];
}
