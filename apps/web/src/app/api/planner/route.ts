import { NextRequest, NextResponse } from 'next/server';
import { scopeToSession } from '@/lib/requestUser';
import { readList, upsertItems, removeItems } from '@/lib/userLists';

export const dynamic = 'force-dynamic';

// Meal planner entries, stored per user. A signed-in user is always pinned to their own session
// (whatever userId the request names); legacy mode (no SESSION_SECRET) trusts the given userId.
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(err: any) {
  return NextResponse.json({ success: false, error: err?.message || 'Planner is unavailable.' }, { status: 500, headers: NO_STORE });
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || 'usr_admin_1' });
  if (scope.error) return scope.error;
  try {
    return NextResponse.json({ success: true, meals: await readList('planner', scope.userId) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const scope = scopeToSession(req, { userId: body?.userId || 'usr_admin_1' });
  if (scope.error) return scope.error;
  // Accepts { meals: [...] }, { meal: {...} }, a bare array, or one bare meal object (the /recipes page sends that).
  const incoming: any[] = Array.isArray(body) ? body
    : Array.isArray(body?.meals) ? body.meals
    : body?.meal ? [body.meal]
    : body && typeof body === 'object' && (body.recipeId || body.recipeName || body.date) ? [body] : [];
  if (incoming.length === 0) return NextResponse.json({ success: false, error: 'No meals supplied.' }, { status: 400, headers: NO_STORE });
  try {
    const meals = await upsertItems('planner', scope.userId, incoming, 'meal');
    return NextResponse.json({ success: true, meals }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || 'usr_admin_1' });
  if (scope.error) return scope.error;
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Missing id.' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ success: true, meals: await removeItems('planner', scope.userId, [id]) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}
