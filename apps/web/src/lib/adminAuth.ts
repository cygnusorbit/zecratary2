import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { isAuthEnforced, readSessionFromRequest } from '@/lib/session';

// Server-side admin check. A no-op until SESSION_SECRET is set (legacy behaviour).
// Accepts a valid signed admin session, or the ADMIN_DB_TOKEN header for scripts.

function tokenOk(req: Request): boolean {
  const expected = (process.env.ADMIN_DB_TOKEN || '').trim();
  const given = (req.headers.get('x-admin-token') || '').trim();
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireAdminSession(req: Request): NextResponse | null {
  if (!isAuthEnforced()) return null;
  const session = readSessionFromRequest(req);
  if (session && session.role === 'admin') return null;
  if (tokenOk(req)) return null;
  return NextResponse.json(
    { success: false, error: session ? 'Administrator access required.' : 'Please sign in as an administrator.' },
    { status: session ? 403 : 401 }
  );
}

// Routes that real visitors legitimately call (registration, profile, checkout record) or that carry their own guard.
const WRITE_EXEMPT = ['/api/admin/database'];
// Admin-only data that has no public consumer.
const READ_GUARDED = [
  '/api/admin/users', '/api/admin/keys', '/api/admin/ai-settings', '/api/admin/ai', '/api/admin/test-key', '/api/admin/models',
  '/api/admin/notification-settings', '/api/admin/plugins', '/api/admin/scan', '/api/admin/crawl-index',
];

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + '/');
}

export function guardAdminApi(req: Request): NextResponse | null {
  if (!isAuthEnforced()) return null;
  let pathname = '';
  try { pathname = new URL(req.url).pathname; } catch (_) { return null; }
  if (!pathname.startsWith('/api/admin/')) return null;

  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return null;

  if (method === 'GET' || method === 'HEAD') {
    return READ_GUARDED.some((b) => under(pathname, b)) ? requireAdminSession(req) : null;
  }
  if (WRITE_EXEMPT.some((b) => under(pathname, b))) return null;
  return requireAdminSession(req);
}
