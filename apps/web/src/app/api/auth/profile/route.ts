import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest, SESSION_COOKIE } from '@/lib/session';
import { findUserByEmail, updateUserFields, deleteUserById, toPublicUser } from '@/lib/userStore';
import { mirrorJsonUser, removeJsonUser } from '@/lib/userJson';

export const dynamic = 'force-dynamic';
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
}

// Update the signed-in user's own display name.
export async function POST(req: NextRequest) {
  const session = readSessionFromRequest(req);
  if (!session) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 100);
    if (!name) return NextResponse.json({ success: false, error: 'Name is required.' }, { status: 400 });
    const row = await findUserByEmail(session.email);
    if (!row) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 });
    await updateUserFields(row.id, { name });
    const user = toPublicUser({ ...row, name });
    mirrorJsonUser(user);
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Update failed' }, { status: 500 });
  }
}

// Delete the signed-in user's own account.
export async function DELETE(req: NextRequest) {
  const session = readSessionFromRequest(req);
  if (!session) return unauthorized();
  if (session.role === 'admin') {
    return NextResponse.json({ success: false, error: 'Administrator accounts cannot be deleted here.' }, { status: 403 });
  }
  try {
    const row = await findUserByEmail(session.email);
    if (row) await deleteUserById(row.id);
    removeJsonUser({ id: row?.id, email: session.email });
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
