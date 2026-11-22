import { NextResponse } from 'next/server';
import { isAuthEnforced, readSessionFromRequest } from '@/lib/session';

// Decides which user a request may act on.
// - Auth not enforced (legacy): the caller's own values are used unchanged.
// - Enforced: a session is required. Regular users are always pinned to their own email and id,
//   whatever the query string or body says. Admins may act on the user they name.
export interface ScopedUser {
  email: string;
  userId: string;
  isAdmin: boolean;
  error?: NextResponse;
}

export function scopeToSession(req: Request, wanted: { email?: string | null; userId?: string | null }): ScopedUser {
  const email = String(wanted.email || '').toLowerCase().trim();
  const userId = String(wanted.userId || '');
  if (!isAuthEnforced()) return { email, userId, isAdmin: false };

  const s = readSessionFromRequest(req);
  if (!s) {
    return { email, userId, isAdmin: false, error: NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 }) };
  }
  if (s.role === 'admin') {
    return { email: email || s.email.toLowerCase(), userId: userId || s.sub, isAdmin: true };
  }
  return { email: s.email.toLowerCase(), userId: s.sub, isAdmin: false };
}
