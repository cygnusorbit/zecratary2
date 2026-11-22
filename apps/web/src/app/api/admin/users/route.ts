import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/session';
import {
  listUsers, findUserByEmail, findUserById, createUser, updateUserFields,
  setPasswordHash, deleteUserById, toPublicUser
} from '@/lib/userStore';
import { readJsonUsers, writeJsonUsers } from '@/lib/userJson';

// Admin-only (enforced in proxy via lib/adminAuth). Passwords are never stored in plain text or returned.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const DEFAULT_ADMIN = {
  id: 'usr_admin_1',
  name: 'System Administrator',
  email: 'admin@zecratary.com',
  role: 'admin',
  subscriptionPlan: 'nutrition-pro-annual',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

async function currentList(): Promise<any[]> {
  let list: any[] = [];
  try {
    const rows = await listUsers();
    list = rows.map(toPublicUser);
  } catch (_) {
    list = readJsonUsers().map(({ password, password_hash, ...u }: any) => u);
  }
  if (!list.some((u) => u.id === 'usr_admin_1' || String(u.email || '').toLowerCase() === 'admin@zecratary.com')) {
    list.unshift(DEFAULT_ADMIN);
  }
  return list;
}

export async function GET() {
  return NextResponse.json({ success: true, users: await currentList() }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const email = String(payload.email || '').toLowerCase().trim();
    const id = payload.id ? String(payload.id) : '';

    let existing: any = null;
    if (id) existing = await findUserById(id).catch(() => null);
    if (!existing && email) existing = await findUserByEmail(email).catch(() => null);

    // Admin sets a temporary password for a user.
    if (payload.action === 'set_password') {
      const pw = String(payload.password || '');
      if (pw.length < 8 || pw.length > 200) {
        return NextResponse.json({ success: false, error: 'Temporary password must be at least 8 characters.' }, { status: 400 });
      }
      if (!existing) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
      await setPasswordHash(existing.id, hashPassword(pw));
      return NextResponse.json({ success: true });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'A valid email is required.' }, { status: 400 });
    }
    const plan = payload.subscriptionPlan || payload.subscription_plan;
    const isRoot = email === 'admin@zecratary.com' || (existing && existing.id === 'usr_admin_1');
    const role = isRoot ? 'admin' : (payload.role === 'admin' ? 'admin' : 'user');
    const pw = payload.password ? String(payload.password) : '';
    if (pw && pw.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    if (existing) {
      await updateUserFields(existing.id, { name: payload.name, role, plan, email });
      if (pw) await setPasswordHash(existing.id, hashPassword(pw));
    } else {
      await createUser({
        id: id || 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        email, name: payload.name || email.split('@')[0], role, plan: plan || 'taster',
        passwordHash: pw ? hashPassword(pw) : null,
      });
    }

    const users = await currentList();
    writeJsonUsers(users);
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const targetId = searchParams.get('id') || body.id || '';
    const targetEmail = String(searchParams.get('email') || body.email || '').toLowerCase().trim();

    if (targetId === 'usr_admin_1' || targetEmail === 'admin@zecratary.com') {
      return NextResponse.json({ error: 'Primary administrator cannot be deleted.' }, { status: 403 });
    }
    let row: any = null;
    if (targetId) row = await findUserById(targetId).catch(() => null);
    if (!row && targetEmail) row = await findUserByEmail(targetEmail).catch(() => null);
    if (row) await deleteUserById(row.id);

    const users = await currentList();
    writeJsonUsers(users);
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
