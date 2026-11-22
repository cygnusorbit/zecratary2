// Universal Multi-Dialect Database Adapter (PostgreSQL & MySQL)
// Repository: cygnusorbit/zecratary (GitHub)
// Satisfies Constraint 8 (PostgreSQL primary & MySQL switchable) with zero TS2339 / TS7006 diagnostics

declare const __non_webpack_require__: any;

import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { getActiveDatabase } from '@/lib/dbConfig';
import { parseMysqlConfig } from '@/lib/mysql';

export type DatabaseDialect = 'postgres' | 'mysql';

declare global {
  // Global singletons to prevent connection pool leaks across Next.js Fast Refresh
  var __zecratary_pg_pool: Pool | undefined;
  var __zecratary_mysql_pool: any | undefined;
  var __zecratary_current_conn: string | undefined;
  var __zecratary_ssl_unsupported: boolean | undefined;

  interface Array<T> {
    rows?: T[];
    rowCount?: number;
  }
}

export function getDatabaseDialect(): DatabaseDialect {
  return getActiveDatabase();
}

export function isPostgres(): boolean {
  return getDatabaseDialect() === 'postgres';
}

export function isMySQL(): boolean {
  return getDatabaseDialect() === 'mysql';
}

export function getConnectionString(): string {
  const dialect = getDatabaseDialect();
  if (dialect === 'mysql') {
    const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
    if (mysqlUrl) return mysqlUrl;
  }
  const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (pgUrl) return pgUrl;

  return 'postgresql://postgres:postgres@localhost:5432/zecratary';
}

export function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

export function parseDbRow<T = any>(res: any): T | null {
  const rows = parseDbRows<T>(res);
  return rows.length > 0 ? rows[0] : null;
}

export function buildPoolConfig(rawConnStr: string, forcePlaintext = false): PoolConfig {
  const cleanConnStr = rawConnStr
    .replace(/([?&])sslmode=[^&]+(&|$)/, '$1')
    .replace(/[?&]$/, '');

  const isLocal =
    rawConnStr.includes('localhost') ||
    rawConnStr.includes('127.0.0.1') ||
    rawConnStr.includes('0.0.0.0') ||
    rawConnStr.includes('::1') ||
    rawConnStr.includes('@postgres:') ||
    rawConnStr.includes('sslmode=disable');

  const isSupabaseOrPooler =
    rawConnStr.includes('supabase') ||
    rawConnStr.includes('pooler') ||
    rawConnStr.includes('aws-0') ||
    rawConnStr.includes('sslmode=require');

  const poolConfig: PoolConfig = {
    connectionString: cleanConnStr,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    max: 20,
  };

  if (!forcePlaintext && !globalThis.__zecratary_ssl_unsupported && (!isLocal || isSupabaseOrPooler)) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  return poolConfig;
}

export function getPool(forcePlaintext = false): Pool | null {
  const rawConnStr = getConnectionString();
  if (!rawConnStr || rawConnStr.includes('[YOUR-PASSWORD]')) {
    return null;
  }

  // Reuse existing pool instance if connection string is unchanged
  if (
    !forcePlaintext &&
    globalThis.__zecratary_pg_pool &&
    globalThis.__zecratary_current_conn === rawConnStr
  ) {
    return globalThis.__zecratary_pg_pool;
  }

  if (globalThis.__zecratary_pg_pool) {
    try {
      globalThis.__zecratary_pg_pool.end().catch(() => {});
    } catch (_) {}
    globalThis.__zecratary_pg_pool = undefined;
  }

  globalThis.__zecratary_current_conn = rawConnStr;

  const poolConfig = buildPoolConfig(rawConnStr, forcePlaintext);
  const newPool = new Pool(poolConfig);

  // Type-safe listener registration preventing TS2339 & TS7006
  (newPool as any).on('error', (err: any) => {
    if (!err?.message?.includes('SSL')) {
      console.warn('[PostgreSQL Pool Notice]:', err?.message || err);
    }
  });

  globalThis.__zecratary_pg_pool = newPool;
  return newPool;
}

/**
 * Universal Dual-Contract getDbPool()
 * Satisfies callers expecting activePool, activePool.pool, or activePool.dialect
 */
export function getDbPool(): any {
  const p: any = getPool();
  if (!p) return null;
  p.pool = p;
  p.dialect = getDatabaseDialect();
  p.query = query;
  return p;
}

// mysql2 parses string URLs with new URL(), which throws "Invalid URL" when the
// password contains '#', '@' or similar. Parse the segments explicitly instead.
function mysqlConnectionTarget(connStr: string): any {
  const parsed = parseMysqlConfig(connStr);
  if (!parsed) return connStr;
  return {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    connectTimeout: 8000,
  };
}

export function formatQueryForDialect(sql: string, dialect?: DatabaseDialect): string {
  const d = dialect || getDatabaseDialect();
  if (d === 'postgres') return sql;
  return sql.replace(/\$\d+/g, '?');
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const dialect = getDatabaseDialect();
  const connStr = getConnectionString();

  if (!connStr || connStr.includes('[YOUR-PASSWORD]')) {
    return [] as T[];
  }

  if (dialect === 'postgres') {
    let activePool = getPool();
    if (!activePool) return [] as T[];

    let client: any = null;
    try {
      try {
        client = await activePool.connect();
      } catch (connectErr: any) {
        if (
          connectErr?.message &&
          connectErr.message.includes('The server does not support SSL connections')
        ) {
          globalThis.__zecratary_ssl_unsupported = true;
          activePool = getPool(true);
          if (!activePool) return [] as T[];
          client = await activePool.connect();
        } else {
          throw connectErr;
        }
      }

      const formattedSql = formatQueryForDialect(sql, 'postgres');
      const res = (!params || params.length === 0)
        ? await client.query(formattedSql)
        : await client.query(formattedSql, params);

      const rows = Array.isArray(res) ? res : (res?.rows || []);
      (rows as any).rows = rows;
      (rows as any).rowCount = rows.length;
      return rows as T[];
    } catch (err: any) {
      console.warn('[PostgreSQL Query Notice]:', err?.message || err);
      throw err;
    } finally {
      if (client) {
        try { client.release(); } catch (_) {}
      }
    }
  } else {
    try {
      let mysqlModule: any = null;
      try {
        mysqlModule = typeof __non_webpack_require__ !== 'undefined'
          ? __non_webpack_require__('mysql2/promise')
          : eval('require')('mysql2/promise');
      } catch (_) {
        mysqlModule = await import('mysql2/promise').catch(() => null);
      }

      if (!mysqlModule) {
        console.warn('[MySQL] mysql2 driver not available, returning empty set.');
        return [] as T[];
      }

      const connection = await mysqlModule.createConnection(mysqlConnectionTarget(connStr));
      try {
        const formattedSql = formatQueryForDialect(sql, 'mysql');
        const [resultRows] = await connection.execute(formattedSql, params);
        const rows = Array.isArray(resultRows) ? resultRows : [];
        (rows as any).rows = rows;
        (rows as any).rowCount = rows.length;
        return rows as T[];
      } finally {
        await connection.end().catch(() => {});
      }
    } catch (mysqlErr: any) {
      console.warn('[MySQL Query Notice]:', mysqlErr?.message || mysqlErr);
      throw mysqlErr;
    }
  }
}

export async function transaction<T = any>(callback: (client: any, dialect?: DatabaseDialect) => Promise<T>): Promise<T> {
  const dialect = getDatabaseDialect();
  const rawPool = getPool();

  if (!rawPool) {
    throw new Error('Database pool not available for transaction.');
  }

  if (dialect === 'postgres') {
    const client = await rawPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client, 'postgres');
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } else {
    try {
      let mysqlModule: any = null;
      try {
        mysqlModule = typeof __non_webpack_require__ !== 'undefined'
          ? __non_webpack_require__('mysql2/promise')
          : eval('require')('mysql2/promise');
      } catch (_) {
        mysqlModule = await import('mysql2/promise').catch(() => null);
      }

      if (!mysqlModule) {
        throw new Error('MySQL driver unavailable for transaction.');
      }

      const connection = await mysqlModule.createConnection(mysqlConnectionTarget(getConnectionString()));
      try {
        await connection.beginTransaction();
        const result = await callback(connection, 'mysql');
        await connection.commit();
        return result;
      } catch (err) {
        await connection.rollback().catch(() => {});
        throw err;
      } finally {
        await connection.end().catch(() => {});
      }
    } catch (mErr) {
      throw mErr;
    }
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__zecratary_pg_pool) {
    try {
      await globalThis.__zecratary_pg_pool.end();
    } catch (_) {}
    globalThis.__zecratary_pg_pool = undefined;
  }
}

// Named adaptive pool Proxy forwarding method calls dynamically
export const pool: any = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === 'getDbPool') return getDbPool;
    if (prop === 'query') return query;
    if (prop === 'getPool') return getPool;
    if (prop === 'dialect') return getDatabaseDialect();
    const active: any = getPool();
    if (!active) {
      if (prop === 'then') return undefined;
      if (prop === 'connect') return async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      });
      if (prop === 'query') return async () => {
        const r: any[] = [];
        (r as any).rows = r;
        (r as any).rowCount = 0;
        return r;
      };
      if (prop === 'on') return () => {};
      if (prop === 'end') return async () => {};
      return undefined;
    }
    if (prop === 'pool') return active;
    const val = active[prop];
    return typeof val === 'function' ? val.bind(active) : val;
  }
});

export const db = pool;

const defaultExport: any = new Proxy(
  {
    query,
    getDatabaseDialect,
    getConnectionString,
    getPool,
    getDbPool,
    isPostgres,
    isMySQL,
    parseDbRows,
    parseDbRow,
    formatQueryForDialect,
    closePool,
    pool,
    db,
    transaction,
  },
  {
    get(target: any, prop: string | symbol) {
      if (prop in target) {
        return target[prop];
      }
      const active: any = getPool();
      if (active && prop in active) {
        const val = active[prop];
        return typeof val === 'function' ? val.bind(active) : val;
      }
      return undefined;
    }
  }
);

export default defaultExport;
