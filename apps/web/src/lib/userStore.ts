import { query, getDatabaseDialect } from '@/lib/db';

// Users in the ACTIVE database (MySQL/MariaDB or PostgreSQL). Passwords are stored only as scrypt hashes.

declare global {
  var __zecratary_users_ready: { dialect: string; ready: Promise<void> } | undefined;
}

async function align(dialect: string): Promise<void> {
  const sql = dialect === 'mysql'
    ? "SELECT COLUMN_NAME AS col_name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
    : "SELECT column_name AS col_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'";
  const rows = await query<any>(sql);
  const cols = new Set((rows || []).map((r: any) => String(r.col_name || r.COLUMN_NAME || r.column_name || '').toLowerCase()));
  if (cols.size === 0) {
    // table missing: create the minimum needed
    await query(
      dialect === 'mysql'
        ? "CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255) UNIQUE, name VARCHAR(255), role VARCHAR(50) DEFAULT 'user', subscription_plan VARCHAR(100), password_hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        : "CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255) UNIQUE, name VARCHAR(255), role VARCHAR(50) DEFAULT 'user', subscription_plan VARCHAR(100), password_hash TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)"
    );
    return;
  }
  const add: Array<[string, string]> = [
    ['password_hash', 'TEXT'],
    ['subscription_plan', 'VARCHAR(100)'],
    ['name', 'VARCHAR(255)'],
  ];
  for (const [name, type] of add) {
    if (cols.has(name)) continue;
    try { await query(`ALTER TABLE users ADD COLUMN ${name} ${type}`); }
    catch (err: any) { console.warn(`[userStore] could not add users.${name}:`, err?.message || err); }
  }
}

function ensure(): Promise<void> {
  const dialect = getDatabaseDialect();
  const cached = globalThis.__zecratary_users_ready;
  if (cached && cached.dialect === dialect) return cached.ready;
  const ready = align(dialect);
  globalThis.__zecratary_users_ready = { dialect, ready };
  ready.catch(() => {
    if (globalThis.__zecratary_users_ready && globalThis.__zecratary_users_ready.ready === ready) globalThis.__zecratary_users_ready = undefined;
  });
  return ready;
}

export interface UserRow { id: string; email: string; name?: string; role?: string; subscription_plan?: string; password_hash?: string | null; [k: string]: any }

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensure();
  const rows = await query<any>('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  return rows && rows[0] ? rows[0] : null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  await ensure();
  const rows = await query<any>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return rows && rows[0] ? rows[0] : null;
}

export async function listUsers(): Promise<UserRow[]> {
  await ensure();
  const rows = await query<any>('SELECT * FROM users ORDER BY created_at ASC');
  return rows || [];
}

export async function createUser(u: { id: string; email: string; name: string; role?: string; plan?: string; passwordHash?: string | null }): Promise<void> {
  await ensure();
  await query(
    'INSERT INTO users (id, email, name, role, subscription_plan, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
    [u.id, u.email.toLowerCase(), u.name, u.role || 'user', u.plan || 'taster', u.passwordHash || null]
  );
}

export async function updateUserFields(id: string, f: { name?: string; role?: string; plan?: string; email?: string }): Promise<void> {
  await ensure();
  const sets: string[] = []; const vals: any[] = [];
  const push = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (f.name !== undefined) push('name', f.name);
  if (f.role !== undefined) push('role', f.role);
  if (f.plan !== undefined) push('subscription_plan', f.plan);
  if (f.email !== undefined) push('email', f.email.toLowerCase());
  if (sets.length === 0) return;
  vals.push(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
}

export async function setPasswordHash(id: string, hash: string): Promise<void> {
  await ensure();
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
}

export async function deleteUserById(id: string): Promise<void> {
  await ensure();
  await query('DELETE FROM users WHERE id = $1', [id]);
}

// Safe shape for the browser: no password material.
export function toPublicUser(row: UserRow): any {
  const { password_hash, password, ...rest } = row as any;
  return {
    ...rest,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    subscriptionPlan: row.subscription_plan || 'taster',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}
