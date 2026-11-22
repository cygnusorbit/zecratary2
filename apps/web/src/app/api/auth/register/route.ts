import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE, isAuthEnforced, signSession, sessionCookieOptions, isAdminEmail,
  hashPassword, isLoginBlocked, recordLoginFailure
} from '@/lib/session';
import { findUserByEmail, createUser, toPublicUser } from '@/lib/userStore';
import { mirrorJsonUser, findJsonUser } from '@/lib/userJson';

export const dynamic = 'force-dynamic';

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 100) || email.split('@')[0];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 200) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const key = 'register:' + ip;
    if (isLoginBlocked(key)) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
    }
    recordLoginFailure(key); // counts every attempt; cleared by window expiry

    if (isAdminEmail(email) || email === 'admin@zecratary.com') {
      return NextResponse.json({ success: false, error: 'This email cannot be registered.' }, { status: 409 });
    }
    const existing = await findUserByEmail(email).catch(() => null);
    if (existing || findJsonUser(email)) {
      return NextResponse.json({ success: false, error: 'An account with this email already exists.' }, { status: 409 });
    }

    const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const plan = 'taster';
    await createUser({ id, email, name, role: 'user', plan, passwordHash: hashPassword(password) });
    const user = { id, name, email, role: 'user', subscriptionPlan: plan, createdAt: new Date().toISOString() };
    mirrorJsonUser(user);

    const response = NextResponse.json({ success: true, user, redirectUrl: '/dashboard' });
    const serialized = JSON.stringify(user);
    for (const ck of ['zecratary_session', 'zecratary_current_user', 'zecratary_auth_session', 'currentUser']) {
      response.cookies.set(ck, serialized, {
        path: '/', httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 86400 * 7
      });
    }
    if (isAuthEnforced()) {
      const sid = signSession({ id, email, role: 'user' });
      if (sid) response.cookies.set(SESSION_COOKIE, sid, sessionCookieOptions());
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Registration failed' }, { status: 500 });
  }
}
