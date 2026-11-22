import fs from 'fs';
import path from 'path';

// Single source of truth for WHICH database engine the app uses.
// Precedence: DATABASE_TYPE env (locked, set on the host) > data/database_config.json
// (set by /setup or /admin/database) > auto-detect from connection URLs (legacy behaviour).
// This file stores ONLY the engine choice. Credentials stay in environment variables.

export type DatabaseEngine = 'postgres' | 'mysql';
export type DatabaseEngineSource = 'env' | 'config' | 'auto';

export interface StoredDatabaseConfig {
  engine: DatabaseEngine;
  profile?: string;
  updatedAt?: string;
}

export interface DatabaseEngineInfo {
  engine: DatabaseEngine;
  source: DatabaseEngineSource;
  locked: boolean;
}

declare global {
  var __zecratary_dbcfg_cache: { at: number; value: StoredDatabaseConfig | null } | undefined;
}

const CACHE_TTL_MS = 3000;

function configPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/database_config.json'),
    path.join(cwd, 'data/database_config.json'),
  ];
}

export function normalizeEngine(value?: string | null): DatabaseEngine | null {
  const v = (value || '').toLowerCase().trim();
  if (v === 'mysql' || v === 'mariadb') return 'mysql';
  if (v === 'postgres' || v === 'postgresql') return 'postgres';
  return null;
}

export function readStoredDatabaseConfig(): StoredDatabaseConfig | null {
  const now = Date.now();
  const cached = globalThis.__zecratary_dbcfg_cache;
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  let value: StoredDatabaseConfig | null = null;
  for (const p of configPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const engine = normalizeEngine(parsed?.engine);
      if (engine) {
        value = { engine, profile: parsed.profile, updatedAt: parsed.updatedAt };
        break;
      }
    } catch (_) {}
  }
  globalThis.__zecratary_dbcfg_cache = { at: now, value };
  return value;
}

export function writeStoredDatabaseConfig(engine: DatabaseEngine, profile?: string): { ok: boolean; path?: string; error?: string } {
  const payload: StoredDatabaseConfig = { engine, profile, updatedAt: new Date().toISOString() };
  let lastError = '';
  for (const p of configPaths()) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf-8');
      globalThis.__zecratary_dbcfg_cache = undefined;
      return { ok: true, path: p };
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }
  return { ok: false, error: lastError || 'No writable data directory.' };
}

// Legacy auto-detection, unchanged from the previous db.ts behaviour.
export function detectEngineFromEnv(): DatabaseEngine {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (url.startsWith('mysql://') || (Boolean(process.env.MYSQL_URL) && !url.startsWith('postgres'))) {
    return 'mysql';
  }
  return 'postgres';
}

export function getDatabaseEngineInfo(): DatabaseEngineInfo {
  const fromEnv = normalizeEngine(process.env.DATABASE_TYPE);
  if (fromEnv) return { engine: fromEnv, source: 'env', locked: true };

  const stored = readStoredDatabaseConfig();
  if (stored) return { engine: stored.engine, source: 'config', locked: false };

  return { engine: detectEngineFromEnv(), source: 'auto', locked: false };
}

export function getActiveDatabase(): DatabaseEngine {
  return getDatabaseEngineInfo().engine;
}
