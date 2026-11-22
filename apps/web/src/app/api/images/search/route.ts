import { NextRequest, NextResponse } from 'next/server';
import { getJsonSetting } from '@/lib/adminSettingsStore';
import { readSessionFromRequest, isAuthEnforced } from '@/lib/session';

// Finds a real photo for a dish name. Signed-in users only. Uses Pexels or Unsplash with a key the admin saved (or an env var).
// Returns { success, url } with url = '' when no key is set or nothing matched, so the page can show a neutral placeholder.
export const dynamic = 'force-dynamic';

const cache = new Map<string, { url: string; at: number }>();
const TTL = 7 * 24 * 3600 * 1000;
const MEAT = /\b(chicken|beef|pork|lamb|steak|bacon|ham|sausage|turkey|duck|fish|salmon|tuna|shrimp|prawn|crab|seafood|meat)\b/i;

async function keyFor(name: string): Promise<string> {
  try {
    const book: any = await getJsonSetting('ai_api_keys');
    const v = book && book[name] ? String(book[name].apiKey || book[name].value || '').trim() : '';
    if (v && !v.includes('•')) return v;
  } catch (_) {}
  return (process.env[name] || '').trim();
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET(req: NextRequest) {
  if (isAuthEnforced() && !readSessionFromRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }
  const q = String(req.nextUrl.searchParams.get('q') || '').replace(/[<>{}\[\]\\|^`"=;:/?#%@$*+~()]/g, ' ').trim().slice(0, 100);
  const meatFree = req.nextUrl.searchParams.get('meatFree') === '1';
  if (q.length < 3) return NextResponse.json({ success: true, url: '' });

  const query = `${q} food dish`;
  const ck = `${query}|${meatFree}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ success: true, url: hit.url });

  let url = '';
  try {
    const pexels = await keyFor('PEXELS_API_KEY');
    const unsplash = await keyFor('UNSPLASH_ACCESS_KEY');
    if (pexels) {
      const r = await fetch(`https://api.pexels.com/v1/search?per_page=8&orientation=landscape&query=${encodeURIComponent(query)}`, { headers: { Authorization: pexels }, cache: 'no-store' });
      if (r.ok) {
        const j: any = await r.json();
        const p = (j.photos || []).find((x: any) => !(meatFree && MEAT.test(String(x.alt || ''))));
        if (p?.src?.large) url = String(p.src.large);
      }
    } else if (unsplash) {
      const r = await fetch(`https://api.unsplash.com/search/photos?per_page=8&orientation=landscape&query=${encodeURIComponent(query)}`, { headers: { Authorization: `Client-ID ${unsplash}` }, cache: 'no-store' });
      if (r.ok) {
        const j: any = await r.json();
        const p = (j.results || []).find((x: any) => !(meatFree && MEAT.test(String(x.alt_description || x.description || ''))));
        if (p?.urls?.regular) url = String(p.urls.regular);
      }
    }
  } catch (_) {}
  cache.set(ck, { url, at: Date.now() });
  return NextResponse.json({ success: true, url });
}
