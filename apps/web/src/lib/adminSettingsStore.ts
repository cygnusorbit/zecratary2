import { query, getDatabaseDialect } from '@/lib/db';

// One canonical key/value store for admin settings, identical on MySQL/MariaDB and PostgreSQL:
//   admin_settings(id, setting_key, setting_value, category, created_at, updated_at)
// Existing tables are never dropped or rewritten; missing columns are added.
// Reads/writes always go to the ACTIVE engine (see lib/dbConfig.ts).

declare global {
  var __zecratary_admin_settings: { dialect: string; ready: Promise<Set<string>> } | undefined;
}

async function createAndAlign(dialect: string): Promise<Set<string>> {
  if (dialect === 'mysql') {
    await query(
      "CREATE TABLE IF NOT EXISTS admin_settings (" +
      "id VARCHAR(255) PRIMARY KEY, " +
      "setting_key VARCHAR(255), " +
      "setting_value LONGTEXT, " +
      "category VARCHAR(100) DEFAULT 'general', " +
      "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, " +
      "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
  } else {
    await query(
      "CREATE TABLE IF NOT EXISTS admin_settings (" +
      "id VARCHAR(255) PRIMARY KEY, " +
      "setting_key VARCHAR(255), " +
      "setting_value TEXT, " +
      "category VARCHAR(100) DEFAULT 'general', " +
      "created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, " +
      "updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );
  }

  const readCols = async (): Promise<Set<string>> => {
    const sql = dialect === 'mysql'
      ? "SELECT COLUMN_NAME AS col_name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_settings'"
      : "SELECT column_name AS col_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'admin_settings'";
    const rows = await query<any>(sql);
    return new Set((rows || []).map((r: any) => String(r.col_name || r.COLUMN_NAME || r.column_name || '').toLowerCase()).filter(Boolean));
  };

  let cols = await readCols();

  const wanted: Array<[string, string, string]> = dialect === 'mysql'
    ? [
        ['id', 'VARCHAR(255)', 'VARCHAR(255)'],
        ['setting_key', 'VARCHAR(255)', 'VARCHAR(255)'],
        ['setting_value', 'LONGTEXT', 'LONGTEXT'],
        ['category', "VARCHAR(100) DEFAULT 'general'", "VARCHAR(100) DEFAULT 'general'"],
        ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
      ]
    : [
        ['id', 'VARCHAR(255)', 'VARCHAR(255)'],
        ['setting_key', 'VARCHAR(255)', 'VARCHAR(255)'],
        ['setting_value', 'TEXT', 'TEXT'],
        ['category', "VARCHAR(100) DEFAULT 'general'", "VARCHAR(100) DEFAULT 'general'"],
        ['updated_at', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP']
      ];

  let added = false;
  for (const [name, mysqlType, pgType] of wanted) {
    if (cols.has(name)) continue;
    try {
      await query(`ALTER TABLE admin_settings ADD COLUMN ${name} ${dialect === 'mysql' ? mysqlType : pgType}`);
      added = true;
    } catch (err: any) {
      console.warn(`[adminSettingsStore] Could not add column ${name}:`, err?.message || err);
    }
  }
  if (added) cols = await readCols();
  return cols;
}

function ensure(): Promise<Set<string>> {
  const dialect = getDatabaseDialect();
  const cached = globalThis.__zecratary_admin_settings;
  if (cached && cached.dialect === dialect) return cached.ready;
  const ready = createAndAlign(dialect);
  globalThis.__zecratary_admin_settings = { dialect, ready };
  // A failed setup must not be cached forever.
  ready.catch(() => {
    if (globalThis.__zecratary_admin_settings && globalThis.__zecratary_admin_settings.ready === ready) {
      globalThis.__zecratary_admin_settings = undefined;
    }
  });
  return ready;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensure();
  const rows = await query<any>('SELECT setting_value FROM admin_settings WHERE setting_key = $1 LIMIT 1', [key]);
  const v = rows && rows[0] ? rows[0].setting_value : null;
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export async function setSetting(key: string, value: string, category = 'general'): Promise<void> {
  const cols = await ensure();
  const dialect = getDatabaseDialect();
  const existing = await query<any>('SELECT setting_key FROM admin_settings WHERE setting_key = $1 LIMIT 1', [key]);
  // Older MySQL tables (schema injector) also carry a mirror `value` column.
  const mirror = dialect === 'mysql' && cols.has('value');

  if (existing && existing.length > 0) {
    if (mirror) {
      await query(
        'UPDATE admin_settings SET setting_value = $1, value = $2, category = $3, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $4',
        [value, value, category, key]
      );
    } else {
      await query(
        'UPDATE admin_settings SET setting_value = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $3',
        [value, category, key]
      );
    }
    return;
  }

  const id = ('set_' + key).slice(0, 255);
  if (mirror) {
    await query(
      'INSERT INTO admin_settings (id, setting_key, setting_value, value, category) VALUES ($1, $2, $3, $4, $5)',
      [id, key, value, value, category]
    );
  } else {
    await query(
      'INSERT INTO admin_settings (id, setting_key, setting_value, category) VALUES ($1, $2, $3, $4)',
      [id, key, value, category]
    );
  }
}

export async function getJsonSetting<T = any>(key: string): Promise<T | null> {
  const raw = await getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (_) {
    return null;
  }
}

export async function setJsonSetting(key: string, value: unknown, category = 'general'): Promise<void> {
  await setSetting(key, JSON.stringify(value), category);
}
