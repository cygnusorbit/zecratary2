import { NextRequest, NextResponse } from 'next/server';
import { scopeToSession } from '@/lib/requestUser';
import { readList, upsertItems, removeItems } from '@/lib/userLists';

export const dynamic = 'force-dynamic';

// Recipe books (cookbooks), stored per user. Same scoping rules as /api/planner. New accounts start with no books.
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(err: any) {
  return NextResponse.json({ success: false, error: err?.message || 'Recipe books are unavailable.' }, { status: 500, headers: NO_STORE });
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || 'usr_admin_1' });
  if (scope.error) return scope.error;
  try {
    return NextResponse.json({ success: true, books: await readList('books', scope.userId) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const first = Array.isArray(body) ? body[0] : null;
  const scope = scopeToSession(req, { userId: body?.userId || first?.userId || 'usr_admin_1' });
  if (scope.error) return scope.error;
  // Accepts a bare array (the /books page sends that), { books: [...] } or { book: {...} }.
  const incoming: any[] = Array.isArray(body) ? body : Array.isArray(body?.books) ? body.books : body?.book ? [body.book] : [];
  try {
    const books = incoming.length ? await upsertItems('books', scope.userId, incoming, 'book') : await readList('books', scope.userId);
    return NextResponse.json({ success: true, books }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const scope = scopeToSession(req, { userId: url.searchParams.get('userId') || 'usr_admin_1' });
  if (scope.error) return scope.error;
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Missing id.' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ success: true, books: await removeItems('books', scope.userId, [id]) }, { headers: NO_STORE });
  } catch (err) { return fail(err); }
}
