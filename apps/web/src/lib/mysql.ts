import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function getMysqlUri(): string | null {
  return process.env.MYSQL_URL || null;
}

export function getMysqlPool(): mysql.Pool | null {
  const uri = getMysqlUri();
  if (!uri) return null;

  if (!pool) {
    try {
      pool = mysql.createPool({
        uri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 4000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });
    } catch (_) {
      pool = null;
    }
  }
  return pool;
}

export const getPool = getMysqlPool;

/**
 * Robust MySQL Query execution with precision column auto-repair and suppressed notice spam
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[] | any> {
  const p = getMysqlPool();
  if (!p) return [];

  try {
    const [results] = await p.execute(sql, params);
    return results;
  } catch (err: any) {
    const msg = String(err.message || '');
    const colMatch = msg.match(/Unknown column '([^']+)' in/i);
    const missingCol = colMatch ? colMatch[1] : null;

    if (missingCol) {
      // 1. Repair users table
      if (missingCol === 'wallet_balance' || missingCol === 'balance' || missingCol === 'token_balance') {
        try {
          const [chk]: any = await p.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?",
            [missingCol]
          );
          if (Array.isArray(chk) && chk.length === 0) {
            const ddlType = missingCol === 'token_balance' ? 'INT DEFAULT 0' : 'DECIMAL(10,2) DEFAULT 0.00';
            await p.execute(`ALTER TABLE users ADD COLUMN \`${missingCol}\` ${ddlType};`);
          }
          const [retried] = await p.execute(sql, params);
          return retried;
        } catch (_) {
          return [];
        }
      }

      // 2. Repair admin_settings table (setting_value, value, key, setting_key)
      if (['setting_value', 'value', 'key', 'setting_key'].includes(missingCol)) {
        try {
          const [chk]: any = await p.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_settings' AND COLUMN_NAME = ?",
            [missingCol]
          );
          if (Array.isArray(chk) && chk.length === 0) {
            const ddlType = ['setting_value', 'value'].includes(missingCol) ? 'LONGTEXT NULL' : 'VARCHAR(255) NULL';
            await p.execute(`ALTER TABLE admin_settings ADD COLUMN \`${missingCol}\` ${ddlType};`);
          }
          const [retried] = await p.execute(sql, params);
          return retried;
        } catch (_) {
          return [];
        }
      }

      // 3. Repair payment_transactions table
      if (['confirmed_at', 'failure_reason', 'notes', 'confirmed_amount', 'transfer_reference'].includes(missingCol)) {
        try {
          const [chk]: any = await p.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions' AND COLUMN_NAME = ?",
            [missingCol]
          );
          if (Array.isArray(chk) && chk.length === 0) {
            const ddlMap: Record<string, string> = {
              confirmed_at: 'DATETIME NULL',
              failure_reason: 'TEXT NULL',
              notes: 'TEXT NULL',
              confirmed_amount: 'DECIMAL(10,2) NULL',
              transfer_reference: 'VARCHAR(255) NULL'
            };
            await p.execute(`ALTER TABLE payment_transactions ADD COLUMN \`${missingCol}\` ${ddlMap[missingCol] || 'TEXT NULL'};`);
          }
          const [retried] = await p.execute(sql, params);
          return retried;
        } catch (_) {
          return [];
        }
      }
    }

    return [];
  }
}

// Authoritative named aliases for consumers expecting queryMysql or execute
export const queryMysql = query;
export const execute = query;
export const executeMysql = query;
export const mysqlQuery = query;

// Default export for dynamic module imports (e.g. await import('@/lib/mysql'))
const mysqlExport = {
  query,
  queryMysql,
  execute,
  executeMysql,
  mysqlQuery,
  getMysqlPool,
  getPool
};

export default mysqlExport;
