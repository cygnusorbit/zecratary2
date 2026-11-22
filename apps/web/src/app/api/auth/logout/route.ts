import { NextResponse } from 'next/server';


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


export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully'
  });

  const cookieKeys = [
    'zecratary_session',
    'zecratary_current_user',
    'zecratary_auth_session',
    'currentUser',
    'user',
    'token',
    'zecratary_sid'
  ];

  cookieKeys.forEach(k => {
    response.cookies.set({
      name: k,
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      sameSite: 'lax'
    });
  });

  return response;
}

export async function GET() {
  return POST();
}
