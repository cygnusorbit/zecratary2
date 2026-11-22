import crypto from 'crypto';

// Signed, HttpOnly server sessions. Enforcement is switched on by setting SESSION_SECRET (>= 32 chars).
// Until then the legacy behaviour is untouched, so deploying this code can never lock anyone out.

export const SESSION_COOKIE = 'zecratary_sid';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  sub: string;
  email: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

function secret(): string | null {
  const s = (process.env.SESSION_SECRET || '').trim();
  return s.length >= 32 ? s : null;
}

export function isAuthEnforced(): boolean {
  return secret() !== null;
}

const b64u = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function hmac(body: string, key: string): Buffer {
  return crypto.createHmac('sha256', key).update(body).digest();
}

export function signSession(user: { id?: string; email: string; role: 'admin' | 'user' }): string | null {
  const key = secret();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: String(user.id || user.email),
    email: user.email.toLowerCase(),
    role: user.role === 'admin' ? 'admin' : 'user',
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(hmac(body, key));
}

export function verifySession(token?: string | null): SessionPayload | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let given: Buffer;
  try { given = Buffer.from(sig, 'base64url'); } catch (_) { return null; }
  const expected = hmac(body, key);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== 'admin' && payload.role !== 'user') return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export function readSessionFromRequest(req: Request): SessionPayload | null {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      return verifySession(decodeURIComponent(part.slice(idx + 1).trim()));
    }
  }
  return null;
}

export function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// ---------- passwords & admin account (from environment variables) ----------

function safeEq(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// stored formats: "scrypt$<saltHex>$<hashHex>" or plain text. bcrypt ($2...) is not supported and is refused.
export function verifyPasswordAgainst(stored: string, input: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    try {
      const expected = Buffer.from(parts[2], 'hex');
      const derived = crypto.scryptSync(input, Buffer.from(parts[1], 'hex'), expected.length);
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch (_) {
      return false;
    }
  }
  if (stored.startsWith('$2')) return false;
  return safeEq(stored, input);
}

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAIL || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes((email || '').trim().toLowerCase());
}

export function verifyAdminPassword(input: string): boolean {
  const hash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (hash) return verifyPasswordAgainst(hash, input);
  const plain = process.env.ADMIN_PASSWORD || '';
  return plain ? safeEq(plain, input) : false;
}

// ---------- brute-force limiter (in memory, per server process) ----------

declare global {
  var __zecratary_login_fail: Map<string, { n: number; first: number }> | undefined;
}
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function failMap() {
  if (!globalThis.__zecratary_login_fail) globalThis.__zecratary_login_fail = new Map();
  return globalThis.__zecratary_login_fail;
}

export function isLoginBlocked(key: string): boolean {
  const e = failMap().get(key);
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) { failMap().delete(key); return false; }
  return e.n >= MAX_FAILS;
}

export function recordLoginFailure(key: string): void {
  const m = failMap();
  const e = m.get(key);
  if (!e || Date.now() - e.first > WINDOW_MS) m.set(key, { n: 1, first: Date.now() });
  else e.n += 1;
}

export function clearLoginFailures(key: string): void {
  failMap().delete(key);
}

// ---------- password hashing (scrypt) ----------

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 32);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
