import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';

// Per-user lists (meal planner, shopping list) kept in the active database through the shared settings store,
// so they follow the one-active-database rule and survive browsers, devices and cleared caches.
// Each list is a JSON array of objects that carry an `id`.

export type ListKind = 'planner' | 'shopping' | 'books';

const MAX_ITEMS = 2000;
const MAX_ITEM_BYTES = 8000;

const keyFor = (kind: ListKind, userId: string) => `user_data:${kind}:${String(userId).slice(0, 120)}`;

export async function readList(kind: ListKind, userId: string): Promise<any[]> {
  const v = await getJsonSetting<any>(keyFor(kind, userId));
  return Array.isArray(v) ? v : [];
}

async function writeList(kind: ListKind, userId: string, list: any[]): Promise<void> {
  await setJsonSetting(keyFor(kind, userId), list.slice(-MAX_ITEMS), 'user_data');
}

function clean(item: any, prefix: string, userId: string): any | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const out = { ...item };
  if (!out.id) out.id = `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  out.id = String(out.id).slice(0, 80);
  out.userId = userId;
  try { if (JSON.stringify(out).length > MAX_ITEM_BYTES) return null; } catch (_) { return null; }
  return out;
}

// Adds new items and replaces the ones with the same id.
export async function upsertItems(kind: ListKind, userId: string, incoming: any[], prefix: string): Promise<any[]> {
  const current = await readList(kind, userId);
  const byId = new Map<string, any>(current.map((i) => [String(i.id), i]));
  for (const raw of incoming.slice(0, 500)) {
    const item = clean(raw, prefix, userId);
    if (item) byId.set(String(item.id), { ...(byId.get(String(item.id)) || {}), ...item });
  }
  const next = Array.from(byId.values());
  await writeList(kind, userId, next);
  return next;
}

export async function removeItems(kind: ListKind, userId: string, ids: string[]): Promise<any[]> {
  const drop = new Set(ids.map(String));
  const next = (await readList(kind, userId)).filter((i) => !drop.has(String(i.id)));
  await writeList(kind, userId, next);
  return next;
}
