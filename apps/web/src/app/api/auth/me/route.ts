import { NextResponse } from 'next/server';
import { isAuthEnforced, readSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Tells the browser whether its server session (HttpOnly cookie) is still valid, so a stale local sign-in
// can be cleared. Until SESSION_SECRET is set the server does not enforce sessions and always answers valid.
export async function GET(req: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isAuthEnforced()) return NextResponse.json({ success: true, enforced: false }, { headers });
  const session = readSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, enforced: true, error: 'Not signed in.' }, { status: 401, headers });
  return NextResponse.json({ success: true, enforced: true, user: { email: session.email, role: session.role } }, { headers });
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
