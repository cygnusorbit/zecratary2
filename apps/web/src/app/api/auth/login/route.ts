import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE, isAuthEnforced, signSession, sessionCookieOptions, isAdminEmail,
  verifyAdminPassword, verifyPasswordAgainst, isLoginBlocked, recordLoginFailure, clearLoginFailures
} from '@/lib/session';
import { findUserByEmail, createUser, setPasswordHash, toPublicUser } from '@/lib/userStore';
import { hashPassword } from '@/lib/session';
import { findJsonUser, readJsonUsers, writeJsonUsers } from '@/lib/userJson';
import fs from 'fs';
import path from 'path';


// Module-scoped type-safe database row extractors (unexported to prevent Next.js TS2344)
function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function parseDbRow<T = any>(res: any): T | null {
  const rows = parseDbRows<T>(res);
  return rows.length > 0 ? rows[0] : null;
}


export const dynamic = 'force-dynamic';

async function recordDatabaseLogin(email: string, userId?: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  const cleanUserId = userId || '';

  // 1. PostgreSQL Audit (Constraint 8)
  try {
    const dbLib = await import('@/lib/db').catch(() => null);
    if (dbLib && typeof dbLib.query === 'function') {
      try {
        await dbLib.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
        `);
      } catch (_) {}
      if (cleanUserId) {
        await dbLib.query(
          `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [cleanUserId]
        );
      } else {
        await dbLib.query(
          `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($1)`,
          [cleanEmail]
        );
      }
    } else {
      const pgUserLib = await import('@/lib/postgresUser').catch(() => null);
      const pool = pgUserLib && typeof (pgUserLib as any).getPostgresPool === 'function' ? (pgUserLib as any).getPostgresPool() : null;
      if (pool) {
        await pool.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
        `);
        if (cleanUserId) {
          await pool.query(
            `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [cleanUserId]
          );
        } else {
          await pool.query(
            `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($1)`,
            [cleanEmail]
          );
        }
      }
    }
  } catch (pgErr) {
    console.debug('[PostgreSQL login update skipped/error]:', pgErr);
  }

  // 2. MySQL Audit (Constraint 8)
  try {
    const mysqlLib = await import('@/lib/mysql').catch(() => null);
    if (mysqlLib && typeof mysqlLib.queryMysql === 'function') {
      try {
        await mysqlLib.queryMysql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME;`);
      } catch (_) {}
      await mysqlLib.queryMysql(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE LOWER(email) = LOWER(?) OR id = ?`,
        [cleanEmail, cleanUserId]
      );
    }
  } catch (myErr) {
    console.debug('[MySQL login update skipped/error]:', myErr);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').toLowerCase().trim();
    const password = body.password || '';

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
    }

    const enforced = isAuthEnforced();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const limiterKey = ip + ':' + email;
    let adminVerified = false;
    if (enforced) {
      if (isLoginBlocked(limiterKey)) {
        return NextResponse.json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
      }
      if (isAdminEmail(email)) {
        if (!verifyAdminPassword(password)) {
          recordLoginFailure(limiterKey);
          return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
        }
        adminVerified = true;
      }
    }

    let enforcedUser: any = null;
    if (enforced) {
      let dbUser: any = null;
      try { dbUser = await findUserByEmail(email); } catch (_) {}
      const jsonUser = findJsonUser(email);
      if (adminVerified) {
        enforcedUser = dbUser ? toPublicUser(dbUser) : (jsonUser || { id: 'usr_admin_1', name: 'System Administrator', email, subscriptionPlan: 'nutrition-pro-annual', createdAt: new Date().toISOString() });
      } else {
        let ok = false;
        if (dbUser && dbUser.password_hash) {
          ok = verifyPasswordAgainst(String(dbUser.password_hash), password);
        } else {
          // Legacy account: accept the old stored password once, then keep only a hash.
          const legacy = (jsonUser && jsonUser.password) || (dbUser && (dbUser as any).password) || '';
          const legacyIsAdmin = (jsonUser && jsonUser.role === 'admin') || (dbUser && dbUser.role === 'admin');
          if (legacy && !legacyIsAdmin && verifyPasswordAgainst(String(legacy), password)) {
            ok = true;
            try {
              const h = hashPassword(password);
              if (dbUser) await setPasswordHash(dbUser.id, h);
              else {
                const nid = (jsonUser && jsonUser.id) || ('usr_' + Date.now().toString(36));
                await createUser({ id: nid, email, name: (jsonUser && jsonUser.name) || email.split('@')[0], role: 'user', plan: (jsonUser && (jsonUser.subscriptionPlan || jsonUser.subscription_plan)) || 'taster', passwordHash: h });
                dbUser = await findUserByEmail(email);
              }
              writeJsonUsers(readJsonUsers());
            } catch (e) { console.warn('[login] legacy password migration failed:', (e as any)?.message || e); }
          }
        }
        if (!ok) {
          recordLoginFailure(limiterKey);
          return NextResponse.json({ success: false, error: 'Invalid email or password. If you have never set a password, ask the administrator to set one for you.' }, { status: 401 });
        }
        enforcedUser = dbUser ? toPublicUser(dbUser) : (jsonUser ? { ...jsonUser } : null);
        if (!enforcedUser) {
          recordLoginFailure(limiterKey);
          return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
        }
      }
    }

    const cwd = process.cwd();
    const paths = [
      path.join(cwd, 'apps/web/data/users.json'),
      path.join(cwd, 'data/users.json')
    ];

    let foundUser: any = enforcedUser;
    for (const p of (enforced ? [] : paths)) {
      if (fs.existsSync(p)) {
        try {
          const list = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (Array.isArray(list)) {
            const match = list.find((u) => u && u.email && u.email.toLowerCase() === email);
            if (match) {
              foundUser = match;
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (!foundUser && !enforced) {
      try {
        const dbLib = await import('@/lib/db').catch(() => null);
        if (dbLib && typeof dbLib.query === 'function') {
          const dbRows = await dbLib.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
          const userRow = Array.isArray(dbRows) ? dbRows[0] : (dbRows as any)?.rows?.[0];
          if (userRow) {
            foundUser = userRow;
          }
        }
      } catch (_) {}
    }


    if (!foundUser) {
      const isEmailAdmin = enforced ? adminVerified : (email.includes('admin') || email.startsWith('admin@'));
      foundUser = {
        id: `usr_${Date.now()}`,
        name: email.split('@')[0],
        email,
        role: isEmailAdmin ? 'admin' : 'user',
        subscriptionPlan: isEmailAdmin ? 'nutrition-pro-annual' : 'taster',
        createdAt: new Date().toISOString()
      };
    }

    if (enforced) {
      // Only the verified env admin can be an admin; nobody is promoted because of their email text or a database flag.
      foundUser = { ...foundUser, role: adminVerified ? 'admin' : 'user' };
    }
    // Never send password material to the browser.
    foundUser = { ...foundUser };
    delete foundUser.password;
    delete foundUser.password_hash;
    clearLoginFailures(limiterKey);

    await recordDatabaseLogin(email, foundUser.id);

    const response = NextResponse.json({
      success: true,
      user: foundUser,
      redirectUrl: '/dashboard'
    });

    const serialized = JSON.stringify(foundUser);
    const cookieKeys = ['zecratary_session', 'zecratary_current_user', 'zecratary_auth_session', 'currentUser'];
    for (const ck of cookieKeys) {
      response.cookies.set(ck, serialized, {
        path: '/',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400 * 7
      });
    }

    if (enforced) {
      const sid = signSession({ id: foundUser.id, email, role: foundUser.role === 'admin' ? 'admin' : 'user' });
      if (sid) response.cookies.set(SESSION_COOKIE, sid, sessionCookieOptions());
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Authentication error' }, { status: 500 });
  }
}
