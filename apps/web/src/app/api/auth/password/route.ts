import { NextRequest, NextResponse } from 'next/server';
import {
  readSessionFromRequest, verifyPasswordAgainst, hashPassword,
  isLoginBlocked, recordLoginFailure, clearLoginFailures
} from '@/lib/session';
import { findUserByEmail, setPasswordHash } from '@/lib/userStore';

export const dynamic = 'force-dynamic';
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

// Change the signed-in user's own password (current password required).
export async function POST(req: NextRequest) {
  const session = readSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  if (session.role === 'admin') {
    return NextResponse.json({ success: false, error: 'The administrator password is managed on the server.' }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const current = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (next.length < 8 || next.length > 200) {
      return NextResponse.json({ success: false, error: 'New password must be at least 8 characters.' }, { status: 400 });
    }
    const key = 'pwchange:' + session.email;
    if (isLoginBlocked(key)) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
    }
    const row = await findUserByEmail(session.email);
    if (!row || !row.password_hash || !verifyPasswordAgainst(String(row.password_hash), current)) {
      recordLoginFailure(key);
      return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 401 });
    }
    await setPasswordHash(row.id, hashPassword(next));
    clearLoginFailures(key);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Update failed' }, { status: 500 });
  }
}
