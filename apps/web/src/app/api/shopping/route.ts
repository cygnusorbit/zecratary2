import { NextRequest, NextResponse } from 'next/server';
import { scopeToSession } from '@/lib/requestUser';
import { readList, upsertItems, removeItems } from '@/lib/userLists';

export const dynamic = 'force-dynamic';

// Shopping list items, stored per user (same rules as /api/planner).
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(err: any) {
  return NextResponse.json({ success: false, error: err?.message || 'Shopping list is unavailable.' }, { status: 500, headers: NO_STORE });
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || 'usr_admin_1' });
  if (scope.error) return scope.error;
  try {
    return NextResponse.json({ success: true, items: await readList('shopping', scope.userId) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const first = Array.isArray(body) ? body[0] : null;
  const scope = scopeToSession(req, { userId: body?.userId || first?.userId || 'usr_admin_1' });
  if (scope.error) return scope.error;
  // Accepts { items: [...] }, { item: {...} } or a bare array (the /recipes page sends that).
  const incoming: any[] = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : body?.item ? [body.item] : [];
  // An empty list is a valid "nothing new" save from the page, not an error.
  if (incoming.length === 0) return NextResponse.json({ success: true, items: await readList('shopping', scope.userId).catch(() => []) }, { headers: NO_STORE });
  try {
    const items = await upsertItems('shopping', scope.userId, incoming, 'shop');
    return NextResponse.json({ success: true, items }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || body?.userId || 'usr_admin_1' });
  if (scope.error) return scope.error;
  const ids: string[] = body?.action === 'remove_completed' && Array.isArray(body.ids)
    ? body.ids.map(String)
    : url.searchParams.get('id') ? [String(url.searchParams.get('id'))] : [];
  if (ids.length === 0) return NextResponse.json({ success: false, error: 'Nothing to delete.' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ success: true, items: await removeItems('shopping', scope.userId, ids) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}
