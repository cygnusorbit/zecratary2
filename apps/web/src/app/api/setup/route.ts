import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { requireDatabaseAdmin, isMasked } from '@/lib/adminGuard';
import { isSetupNeeded, normalizeEngine, writeStoredDatabaseConfig } from '@/lib/dbConfig';
import type { DatabaseEngine } from '@/lib/dbConfig';
import { probeEngine, withTimeout } from '@/lib/dbProbe';
import { buildPoolConfig } from '@/lib/db';
import { injectCompleteMysqlDatabase } from '@/lib/mysqlSchemaInjector';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token'
    }
  });
}

// Public, secret-free status used by the first-run redirect and the wizard.
export async function GET() {
  return NextResponse.json({
    needsSetup: isSetupNeeded(),
    adminTokenConfigured: !!(process.env.ADMIN_DB_TOKEN || '').trim(),
    production: process.env.NODE_ENV === 'production'
  });
}

function envKeyFor(engine: DatabaseEngine): string {
  return engine === 'mysql' ? 'MYSQL_URL' : 'DATABASE_URL';
}

// Single-quoted so '#', '$' and '\' in passwords are never interpreted by the env loader.
function upsertEnvFile(key: string, value: string): { ok: boolean; path?: string; error?: string } {
  try {
    const cwd = process.cwd();
    const dir = fs.existsSync(path.join(cwd, 'apps/web')) ? path.join(cwd, 'apps/web') : cwd;
    const file = path.join(dir, '.env.local');
    let text = '';
    try { text = fs.readFileSync(file, 'utf-8'); } catch (_) {}
    const line = `${key}='${value}'`;
    const re = new RegExp('^\\s*' + key + '\\s*=.*$', 'm');
    if (re.test(text)) {
      text = text.replace(re, () => line);
    } else {
      text = (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n';
    }
    fs.writeFileSync(file, text, { encoding: 'utf-8', mode: 0o600 });
    return { ok: true, path: file };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function createPostgresSchema(uri: string): Promise<{ ok: boolean; tables?: number; error?: string }> {
  const cwd = process.cwd();
  const file = [path.join(cwd, 'scripts/schema.sql'), path.join(cwd, '../../scripts/schema.sql')].find((p) => fs.existsSync(p));
  if (!file) return { ok: false, error: 'scripts/schema.sql was not found on the server, so tables were not created.' };
  let pool: any = null;
  try {
    const cfg: any = buildPoolConfig(uri);
    pool = new Pool({ connectionString: cfg.connectionString, ssl: cfg.ssl, max: 1, connectionTimeoutMillis: 6000 });
    pool.on('error', () => {});
    await pool.query(fs.readFileSync(file, 'utf-8'));
    const res: any = await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
    return { ok: true, tables: res && res.rows && res.rows[0] ? res.rows[0].n : undefined };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err).split(uri).join('***').slice(0, 300) };
  } finally {
    if (pool) { try { await pool.end(); } catch (_) {} }
  }
}

export async function POST(req: Request) {
  // Locked forever once anything is configured: this endpoint can never replace a live database.
  if (!isSetupNeeded()) {
    return NextResponse.json({ success: false, error: 'Already configured. Use /admin/database to switch engines.' }, { status: 403 });
  }
  const denied = requireDatabaseAdmin(req);
  if (denied) return denied;

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const engine = normalizeEngine(body?.engine);
  const uri = String(body?.uri || '').trim();
  if (!engine) return NextResponse.json({ success: false, error: 'Choose PostgreSQL or MySQL.' }, { status: 400 });
  if (!uri || isMasked(uri) || /[\r\n]/.test(uri) || uri.length > 2000) {
    return NextResponse.json({ success: false, error: 'Enter a valid connection string on a single line.' }, { status: 400 });
  }
  const schemeOk = engine === 'mysql' ? /^mysql:\/\//i.test(uri) : /^postgres(ql)?:\/\//i.test(uri);
  if (!schemeOk) {
    return NextResponse.json({
      success: false,
      error: engine === 'mysql' ? 'A MySQL string must start with mysql://' : 'A PostgreSQL string must start with postgresql:// or postgres://'
    }, { status: 400 });
  }
  if (uri.includes("'")) {
    return NextResponse.json({ success: false, error: "The connection string cannot contain a ' character. URL-encode it (%27)." }, { status: 400 });
  }

  const probe = await withTimeout(probeEngine(engine, uri), 9000, { ok: false, latencyMs: 0, error: 'Connection timed out after 9 seconds.' } as any);

  if (body?.action === 'test') {
    return NextResponse.json(probe.ok
      ? { success: true, latency: probe.latencyMs, version: probe.version, database: probe.database, message: `Login succeeded (${probe.latencyMs} ms${probe.version ? ', ' + probe.version : ''}).` }
      : { success: false, error: probe.error });
  }

  if (body?.action !== 'complete') {
    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
  }
  if (!probe.ok) {
    return NextResponse.json({ success: false, error: `Could not log in: ${probe.error}` });
  }

  const key = envKeyFor(engine);
  const previous = process.env[key];
  process.env[key] = uri; // effective immediately in this process

  const envFile = upsertEnvFile(key, uri);
  const cfg = writeStoredDatabaseConfig(engine, engine === 'mysql' ? 'localhost_mysql' : 'supabase_cloud');

  if (!envFile.ok && !cfg.ok) {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    return NextResponse.json({
      success: false,
      error: `Could not save anything on this server (${envFile.error}). Set ${key} (and optionally DATABASE_TYPE=${engine}) in the host environment variables, then redeploy.`
    });
  }

  let schema: { ok: boolean; tables?: number; error?: string } = { ok: true };
  if (body?.createSchema !== false) {
    if (engine === 'mysql') {
      const r: any = await injectCompleteMysqlDatabase();
      schema = { ok: !!r.success, tables: Array.isArray(r.tablesCreated) ? r.tablesCreated.length : undefined, error: r.error };
    } else {
      schema = await createPostgresSchema(uri);
    }
  }

  return NextResponse.json({
    success: true,
    engine,
    schema,
    persisted: { envFile: envFile.ok, engineFile: cfg.ok },
    message: `Connected to ${engine === 'mysql' ? 'MySQL / MariaDB' : 'PostgreSQL'}.`
      + (schema.ok ? (schema.tables !== undefined ? ` ${schema.tables} tables ready.` : '') : ' Tables could not be created: ' + (schema.error || 'unknown error')),
    note: envFile.ok ? undefined : `The connection string was not written to a file. Also set ${key} in the host environment variables so it survives a restart.`
  });
}
