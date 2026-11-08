import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getMysqlUri(): string | null {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;
  if (process.env.MYSQL_DATABASE && process.env.MYSQL_USER) {
    const host = process.env.MYSQL_HOST || 'localhost';
    const port = process.env.MYSQL_PORT || '3306';
    const user = encodeURIComponent(process.env.MYSQL_USER);
    const pass = process.env.MYSQL_PASSWORD ? encodeURIComponent(process.env.MYSQL_PASSWORD) : '';
    const db = process.env.MYSQL_DATABASE;
    return `mysql://${user}:${pass}@${host}:${port}/${db}`;
  }
  return null;
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
        connectTimeout: 5000,
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
      if (['wallet_balance', 'balance', 'token_balance'].includes(missingCol)) {
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
    }

    return [];
  }
}

export const queryMysql = query;
export const execute = query;
export const executeMysql = query;
export const mysqlQuery = query;

const mysqlExport = {
  query,
  queryMysql,
  execute,
  executeMysql,
  mysqlQuery,
  getMysqlPool,
  getPool,
  getMysqlUri
};

export default mysqlExport;
