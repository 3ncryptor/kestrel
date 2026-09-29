import { searchIndex } from '@/lib/pages';

// The ⌘K index as one static file, built with the site: the palette fetches it the first time it opens, so
// pages don't carry it.
export const dynamic = 'force-static';

export async function GET() {
    return Response.json(await searchIndex());
}
