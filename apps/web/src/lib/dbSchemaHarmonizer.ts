import fs from 'fs';
import path from 'path';

let harmonized = false;

function getDatabaseConfig(): { postgresUrl?: string; mysqlUrl?: string } {
  let postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_POOLER_URI;
  let mysqlUrl = process.env.MYSQL_URL;

  const envCandidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/web/.env.local'),
    path.resolve(process.cwd(), 'apps/web/.env'),
    path.resolve(process.cwd(), '../../.env.local'),
    path.resolve(process.cwd(), '../.env.local')
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const raw = fs.readFileSync(envPath, 'utf-8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.substring(0, idx).trim();
            const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!postgresUrl && (k === 'DATABASE_URL' || k === 'POSTGRES_URL' || k === 'SUPABASE_POOLER_URI')) {
              postgresUrl = v;
            }
            if (!mysqlUrl && k === 'MYSQL_URL') {
              mysqlUrl = v;
            }
          }
        }
      } catch (_) {}
    }
  }

  return { postgresUrl, mysqlUrl };
}

/**
 * Harmonizes schema in PostgreSQL (Supabase / Pooler)
 */
async function harmonizePostgreSql(connectionString: string): Promise<boolean> {
  try {
    const { Client } = await import('pg');
    const client = new Client({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    });

    await client.connect();

    const statements = [
      `CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS admin_settings (id VARCHAR(255) PRIMARY KEY, setting_key VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS subscription_plans (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS token_packages (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS payment_transactions (id VARCHAR(255) PRIMARY KEY, description VARCHAR(255));`,

      // Missing users columns
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) DEFAULT 0.00;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) DEFAULT 0.00;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance INT DEFAULT 0;`,

      // Missing admin_settings columns
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS setting_value TEXT;`,
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS setting_key VARCHAR(255);`,
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS value TEXT;`,
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS "key" VARCHAR(255);`,

      // Missing payment_transactions audit columns
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;`,
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS failure_reason TEXT;`,
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS confirmed_amount NUMERIC(10,2);`,

      // Backfill
      `UPDATE users SET wallet_balance = COALESCE(balance, 150.00) WHERE wallet_balance IS NULL;`,
      `UPDATE users SET balance = COALESCE(wallet_balance, 150.00) WHERE balance IS NULL;`,
      `UPDATE admin_settings SET setting_value = COALESCE(value, '') WHERE setting_value IS NULL;`,
      `UPDATE admin_settings SET value = COALESCE(setting_value, '') WHERE value IS NULL;`,
      `UPDATE admin_settings SET "key" = COALESCE(setting_key, '') WHERE "key" IS NULL;`,
      `UPDATE admin_settings SET setting_key = COALESCE("key", '') WHERE setting_key IS NULL;`
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
      } catch (_) {}
    }

    await client.end();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Harmonizes schema in MySQL
 */
async function harmonizeMySql(connectionString: string): Promise<boolean> {
  try {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(connectionString);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id VARCHAR(255) PRIMARY KEY,
        setting_key VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const checks = [
      { table: 'users', column: 'wallet_balance', ddl: 'DECIMAL(10,2) DEFAULT 0.00' },
      { table: 'users', column: 'balance', ddl: 'DECIMAL(10,2) DEFAULT 0.00' },
      { table: 'users', column: 'token_balance', ddl: 'INT DEFAULT 0' },
      { table: 'admin_settings', column: 'setting_value', ddl: 'LONGTEXT NULL' },
      { table: 'admin_settings', column: 'setting_key', ddl: 'VARCHAR(255) NULL' },
      { table: 'admin_settings', column: 'value', ddl: 'LONGTEXT NULL' },
      { table: 'admin_settings', column: 'key', ddl: 'VARCHAR(255) NULL' },
      { table: 'payment_transactions', column: 'confirmed_at', ddl: 'DATETIME NULL' },
      { table: 'payment_transactions', column: 'failure_reason', ddl: 'TEXT NULL' },
      { table: 'payment_transactions', column: 'notes', ddl: 'TEXT NULL' },
      { table: 'payment_transactions', column: 'confirmed_amount', ddl: 'DECIMAL(10,2) NULL' }
    ];

    for (const { table, column, ddl } of checks) {
      try {
        const [rows]: any = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [table, column]
        );
        if (Array.isArray(rows) && rows.length === 0) {
          await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
        }
      } catch (_) {}
    }

    try {
      await connection.query(`UPDATE users SET wallet_balance = COALESCE(balance, 150.00) WHERE wallet_balance IS NULL`);
      await connection.query(`UPDATE users SET balance = COALESCE(wallet_balance, 150.00) WHERE balance IS NULL`);
      await connection.query(`UPDATE admin_settings SET setting_value = COALESCE(value, '') WHERE setting_value IS NULL`);
      await connection.query(`UPDATE admin_settings SET value = COALESCE(setting_value, '') WHERE value IS NULL`);
      await connection.query(`UPDATE admin_settings SET \`key\` = COALESCE(setting_key, '') WHERE \`key\` IS NULL`);
      await connection.query(`UPDATE admin_settings SET setting_key = COALESCE(\`key\`, '') WHERE setting_key IS NULL`);
    } catch (_) {}

    await connection.end();
    return true;
  } catch (_) {
    return false;
  }
}

export async function harmonizeDatabaseSchema(): Promise<void> {
  if (harmonized) return;
  harmonized = true;

  const { postgresUrl, mysqlUrl } = getDatabaseConfig();

  if (postgresUrl) {
    await harmonizePostgreSql(postgresUrl);
  }
  if (mysqlUrl) {
    await harmonizeMySql(mysqlUrl);
  }
}
