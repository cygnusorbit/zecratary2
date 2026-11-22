import fs from 'fs';
import path from 'path';

// Offline mirror of users (data/users.json). Never holds passwords.
const STORES = [
  path.join(process.cwd(), 'apps', 'web', 'data', 'users.json'),
  path.join(process.cwd(), 'data', 'users.json'),
];

export function readJsonUsers(): any[] {
  for (const p of STORES) {
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.users)) return parsed.users;
    } catch (_) {}
  }
  return [];
}

export function writeJsonUsers(users: any[]): void {
  const clean = users.map((u) => {
    const { password, password_hash, ...rest } = u || {};
    return rest;
  });
  for (const p of STORES) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(clean, null, 2), 'utf-8');
    } catch (_) {}
  }
}

export function findJsonUser(email: string): any | null {
  const e = email.toLowerCase();
  return readJsonUsers().find((u) => u && u.email && String(u.email).toLowerCase() === e) || null;
}

export function mirrorJsonUser(user: any): void {
  const list = readJsonUsers();
  const i = list.findIndex((u) => u && (u.id === user.id || (u.email && String(u.email).toLowerCase() === String(user.email).toLowerCase())));
  if (i >= 0) list[i] = { ...list[i], ...user }; else list.unshift(user);
  writeJsonUsers(list);
}

export function removeJsonUser(idOrEmail: { id?: string; email?: string }): void {
  const e = (idOrEmail.email || '').toLowerCase();
  writeJsonUsers(readJsonUsers().filter((u) => !((idOrEmail.id && u.id === idOrEmail.id) || (e && u.email && String(u.email).toLowerCase() === e))));
}
