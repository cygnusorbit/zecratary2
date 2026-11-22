import { NextRequest, NextResponse } from 'next/server';
import { inspectSource } from '@/lib/recipeSources';

// Admin-only (guarded in proxy for writes): checks whether the configured recipe source URLs can really be read.
export const dynamic = 'force-dynamic';

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const urls: string[] = (Array.isArray(body.urls) ? body.urls : []).map((u: any) => String(u || '').trim()).filter(Boolean).slice(0, 10);
    if (urls.length === 0) return NextResponse.json({ success: false, error: 'No URLs to check.' }, { status: 400 });
    const results = await Promise.all(urls.map(async (url) => {
      const r = await inspectSource(url, true);
      return {
        url,
        ok: r.ok,
        kind: r.kind,
        title: r.title || '',
        recipeCount: r.kind === 'recipe' ? 1 : (r.links ? r.links.length : 0),
        sample: r.kind === 'recipe' ? [r.title || ''] : (r.links || []).slice(0, 3).map((l) => l.title),
        error: r.error || '',
      };
    }));
    return NextResponse.json({ success: true, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Check failed' }, { status: 500 });
  }
}
