import { NextRequest, NextResponse } from 'next/server';
import { isAuthEnforced } from '@/lib/session';
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

async function syncUserToDatabase(user: any): Promise<void> {
  const email = (user.email || '').toLowerCase().trim();
  const userId = user.id || '';
  if (!email && !userId) return;

  // 1. PostgreSQL Synchronization (Constraint 8)
  try {
    const dbLib = await import('@/lib/db').catch(() => null);
    if (dbLib && typeof dbLib.query === 'function') {
      try {
        await dbLib.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
        `);
      } catch (_) {}
      await dbLib.query(
        `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($1) OR id = $2`,
        [email, userId]
      );
    } else {
      const pgUserLib = await import('@/lib/postgresUser').catch(() => null);
      const pool = pgUserLib && typeof (pgUserLib as any).getPostgresPool === 'function' ? (pgUserLib as any).getPostgresPool() : null;
      if (pool) {
        await pool.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
        `);
        await pool.query(
          `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($1) OR id = $2`,
          [email, userId]
        );
      }
    }
  } catch (pgErr) {
    console.debug('[PostgreSQL Google sync skipped/error]:', pgErr);
  }

  // 2. MySQL Synchronization (Constraint 8)
  try {
    const mysqlLib = await import('@/lib/mysql').catch(() => null);
    if (mysqlLib && typeof mysqlLib.queryMysql === 'function') {
      try {
        await mysqlLib.queryMysql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME;`);
      } catch (_) {}
      await mysqlLib.queryMysql(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE LOWER(email) = LOWER(?) OR id = ?`,
        [email, userId]
      );
    }
  } catch (myErr) {
    console.debug('[MySQL Google sync skipped/error]:', myErr);
  }
}

function syncUserToStore(user: any): any {
  const cwd = process.cwd();
  const paths = [
    path.join(cwd, 'apps/web/data/users.json'),
    path.join(cwd, 'data/users.json')
  ];

  let resolvedUser = user;

  for (const p of paths) {
    try {
      let usersList: any[] = [];
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        usersList = JSON.parse(raw);
        if (!Array.isArray(usersList)) usersList = [];
      } else {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }

      const existingIndex = usersList.findIndex(
        (u) => u && u.email && u.email.toLowerCase() === user.email.toLowerCase()
      );

      if (existingIndex >= 0) {
        usersList[existingIndex] = {
          ...usersList[existingIndex],
          name: user.name || usersList[existingIndex].name,
          picture: user.picture || usersList[existingIndex].picture,
          avatar: user.picture || usersList[existingIndex].avatar,
          lastLoginAt: new Date().toISOString()
        };
        resolvedUser = usersList[existingIndex];
      } else {
        usersList.unshift(user);
      }

      fs.writeFileSync(p, JSON.stringify(usersList, null, 2), 'utf-8');
    } catch (err) {
      console.error('[google-session] Error syncing user to store:', p, err);
    }
  }

  return resolvedUser;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = body.profile;
    const requestedCallback = body.callbackUrl || '';

    if (!profile || !profile.email) {
      return NextResponse.json({ error: 'Missing profile email' }, { status: 400 });
    }

    const email = profile.email.toLowerCase().trim();
    const name = profile.name || profile.given_name || email.split('@')[0];
    const picture = profile.picture || '';
    const googleId = profile.sub || profile.id || Date.now().toString();

    const isEmailAdmin = isAuthEnforced() ? false : (email.includes('admin') || email === 'cygnusorbit@gmail.com' || email.startsWith('admin@'));

    const candidateUser = {
      id: `usr_g_${googleId}`,
      name,
      email,
      role: isEmailAdmin ? 'admin' : 'user',
      subscriptionPlan: isEmailAdmin ? 'nutrition-pro-annual' : 'taster',
      picture,
      avatar: picture,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    const finalUser = syncUserToStore(candidateUser);
    await syncUserToDatabase(finalUser);

    let redirectUrl = requestedCallback.trim();
    if (
      !redirectUrl || 
      redirectUrl === '/login' || 
      redirectUrl.startsWith('/login') ||
      redirectUrl === '/profile' ||
      redirectUrl.startsWith('/profile')
    ) {
      redirectUrl = '/dashboard';
    }

    const response = NextResponse.json({
      success: true,
      user: finalUser,
      redirectUrl
    });

    const serializedUser = JSON.stringify(finalUser);
    const cookieKeys = ['zecratary_current_user', 'zecratary_auth_session', 'zecratary_session', 'currentUser'];
    for (const ck of cookieKeys) {
      response.cookies.set(ck, serializedUser, {
        path: '/',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400 * 7
      });
    }

    return response;
  } catch (err: any) {
    console.error('[google-session] Error:', err);
    return NextResponse.json({ error: err.message || 'Session creation failed' }, { status: 500 });
  }
}
