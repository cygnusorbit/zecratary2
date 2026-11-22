import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import { parseMysqlConfig } from '@/lib/mysql';
import { buildPoolConfig } from '@/lib/db';
import type { DatabaseEngine } from '@/lib/dbConfig';

export { withTimeout } from '@/lib/withTimeout';

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  version?: string;
  database?: string;
  error?: string;
}

// Remove the URI and its password from any error text before it reaches the browser.
function scrub(message: unknown, uri: string): string {
  let out = String(message || 'Connection failed');
  const secrets: string[] = [];
  if (uri && uri.length > 2) secrets.push(uri);
  const m = uri.match(/^[a-z][a-z0-9+.\-]*:\/\/[^:@\/]+:(.*)@[^@]*$/i);
  if (m && m[1] && m[1].length > 1) secrets.push(m[1]);
  for (const s of secrets) out = out.split(s).join('***');
  return out.slice(0, 300);
}

export function getEngineUri(engine: DatabaseEngine): string | null {
  if (engine === 'mysql') {
    const direct = process.env.MYSQL_URL || '';
    if (direct) return direct;
    const shared = process.env.DATABASE_URL || '';
    return /^mysql:\/\//i.test(shared) ? shared : null;
  }
  const candidates = [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.POSTGRES_PRISMA_URL];
  const found = candidates.find((u) => !!u && /^postgres(ql)?:\/\//i.test(u));
  return found || null;
}

export async function probeMysql(uri: string): Promise<ProbeResult> {
  const started = Date.now();
  let conn: any = null;
  try {
    const parsed = parseMysqlConfig(uri);
    conn = await mysql.createConnection(
      parsed
        ? { host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password, database: parsed.database, connectTimeout: 6000 }
        : { uri, connectTimeout: 6000 }
    );
    const [rows]: any = await conn.query('SELECT 1 AS ok, VERSION() AS v, DATABASE() AS d');
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      ok: true,
      latencyMs: Math.max(1, Date.now() - started),
      version: row && row.v ? String(row.v) : undefined,
      database: row && row.d ? String(row.d) : undefined,
    };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - started, error: scrub(err && (err.message || err.code), uri) };
  } finally {
    if (conn) { try { await conn.end(); } catch (_) {} }
  }
}

export async function probePostgres(uri: string): Promise<ProbeResult> {
  const started = Date.now();
  let pool: any = null;
  try {
    const cfg: any = buildPoolConfig(uri);
    pool = new Pool({ connectionString: cfg.connectionString, ssl: cfg.ssl, max: 1, connectionTimeoutMillis: 6000 });
    pool.on('error', () => {});
    const res: any = await pool.query('SELECT 1 AS ok, version() AS v, current_database() AS d');
    const row = res && res.rows ? res.rows[0] : null;
    return {
      ok: true,
      latencyMs: Math.max(1, Date.now() - started),
      version: row && row.v ? String(row.v).slice(0, 60) : undefined,
      database: row && row.d ? String(row.d) : undefined,
    };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - started, error: scrub(err && (err.message || err.code), uri) };
  } finally {
    if (pool) { try { await pool.end(); } catch (_) {} }
  }
}

export function probeEngine(engine: DatabaseEngine, uri: string): Promise<ProbeResult> {
  return engine === 'mysql' ? probeMysql(uri) : probePostgres(uri);
}
