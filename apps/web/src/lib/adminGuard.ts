import crypto from 'crypto';
import { NextResponse } from 'next/server';

const BULLETS = '••••••••';

export function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.includes('•');
}

export function maskSecret(value?: string | null): string {
  const v = (value || '').trim();
  if (!v) return '';
  return v.length <= 8 ? BULLETS : BULLETS + v.slice(-4);
}

// scheme://user:password@host/db  ->  scheme://user:********@host/db
// Password may contain '#' or '@', so match greedily up to the LAST '@'.
export function maskConnectionUri(uri?: string | null): string {
  const v = (uri || '').trim();
  if (!v) return '';
  const m = v.match(/^([a-z][a-z0-9+.\-]*:\/\/[^:@\/]+):(.*)@([^@]*)$/i);
  if (!m || m[2] === '') return v;
  return m[1] + ':' + BULLETS + '@' + m[3];
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Guards database-changing / network-probing actions.
// - Server env ADMIN_DB_TOKEN set: request must send header x-admin-token with the same value.
// - Not set + production: refuse (safe by default).
// - Not set + development: allow, so local work is not blocked.
export function requireDatabaseAdmin(req: Request): NextResponse | null {
  const expected = (process.env.ADMIN_DB_TOKEN || '').trim();
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Database changes are disabled until ADMIN_DB_TOKEN is set in the server environment.' },
        { status: 503 }
      );
    }
    return null;
  }
  const given = (req.headers.get('x-admin-token') || '').trim();
  if (!given || !safeEqual(given, expected)) {
    return NextResponse.json({ success: false, error: 'Admin token required or invalid.' }, { status: 401 });
  }
  return null;
}
