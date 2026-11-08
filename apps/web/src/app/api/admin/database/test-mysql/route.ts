import { NextResponse } from 'next/server';
import { getMysqlPool, getMysqlUri } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  const uri = getMysqlUri();
  if (!uri) {
    return NextResponse.json({
      connected: false,
      error: 'MYSQL_URL environment variable is not defined or is empty.',
      provider: 'mysql'
    }, { status: 400 });
  }

  const pool = getMysqlPool();
  if (!pool) {
    return NextResponse.json({
      connected: false,
      error: 'Failed to create MySQL connection pool.',
      provider: 'mysql'
    }, { status: 500 });
  }

  const startTime = Date.now();
  try {
    const [rows]: any = await pool.query('SELECT 1 AS alive, DATABASE() AS db_name, VERSION() AS mysql_ver, NOW() AS srv_time');
    const latency = Date.now() - startTime;
    const dbInfo = Array.isArray(rows) && rows[0] ? rows[0] : {};

    return NextResponse.json({
      connected: true,
      latencyMs: latency,
      database: dbInfo.db_name || 'unknown',
      version: dbInfo.mysql_ver || 'unknown',
      serverTime: dbInfo.srv_time || null,
      provider: 'mysql'
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message || 'MySQL connection error',
      code: err.code || 'ERR_CONNECTION',
      provider: 'mysql'
    }, { status: 500 });
  }
}
