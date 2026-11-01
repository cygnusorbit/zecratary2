import fs from 'fs';
import path from 'path';

let harmonized = false;

/**
 * Discovers database connection strings from process.env and disk .env files
 */
function getDatabaseConfig(): { postgresUrl?: string; mysqlUrl?: string } {
  let postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_POOLER_URI;
  let mysqlUrl = process.env.MYSQL_URL;

  const envCandidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/web/.env.local'),
    path.resolve(process.cwd(), 'apps/web/.env')
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
 * Harmonizes missing columns in PostgreSQL (Supabase)
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
      // Ensure base tables exist
      `CREATE TABLE IF NOT EXISTS subscription_plans (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS token_packages (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS payment_transactions (id VARCHAR(255) PRIMARY KEY, description VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS token_settings (id VARCHAR(255) PRIMARY KEY);`,
      `CREATE TABLE IF NOT EXISTS user_tokens (id VARCHAR(255) PRIMARY KEY);`,
      `CREATE TABLE IF NOT EXISTS tokens (id VARCHAR(255) PRIMARY KEY);`,
      `CREATE TABLE IF NOT EXISTS currencies (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS saved_recipes (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), title VARCHAR(255));`,
      `CREATE TABLE IF NOT EXISTS recipes (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), title VARCHAR(255));`,

      // Missing price & price_monthly columns
      `ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;`,
      `ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(10,2) DEFAULT 0;`,
      `ALTER TABLE token_packages ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;`,
      `ALTER TABLE token_packages ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(10,2) DEFAULT 0;`,
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;`,
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0;`,

      // Missing expiry_date columns
      `ALTER TABLE token_settings ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;`,
      `ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;`,
      `ALTER TABLE tokens ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;`,

      // Missing created_by columns
      `ALTER TABLE currencies ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) DEFAULT 'system';`,
      `ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) DEFAULT 'system';`,
      `ALTER TABLE token_packages ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) DEFAULT 'system';`,

      // Missing recipe_name columns
      `ALTER TABLE saved_recipes ADD COLUMN IF NOT EXISTS recipe_name VARCHAR(255);`,
      `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_name VARCHAR(255);`,

      // Backfill default values
      `UPDATE subscription_plans SET price = COALESCE(price_monthly, 0) WHERE price IS NULL OR price = 0;`,
      `UPDATE token_packages SET price = COALESCE(price_monthly, 0) WHERE price IS NULL OR price = 0;`,
      `UPDATE saved_recipes SET recipe_name = COALESCE(name, title, 'Delicious Recipe') WHERE recipe_name IS NULL;`,
      `UPDATE recipes SET recipe_name = COALESCE(name, title, 'Delicious Recipe') WHERE recipe_name IS NULL;`
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
      } catch (_) {
        // Quietly continue if already exists or table structure differs
      }
    }

    await client.end();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Harmonizes missing columns in MySQL
 */
async function harmonizeMySql(connectionString: string): Promise<boolean> {
  try {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(connectionString);

    const checks = [
      { table: 'subscription_plans', column: 'price', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'subscription_plans', column: 'price_monthly', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'token_packages', column: 'price', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'token_packages', column: 'price_monthly', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'payment_transactions', column: 'price', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'payment_transactions', column: 'amount', ddl: 'DECIMAL(10,2) DEFAULT 0' },
      { table: 'token_settings', column: 'expiry_date', ddl: 'DATETIME NULL' },
      { table: 'currencies', column: 'created_by', ddl: "VARCHAR(255) DEFAULT 'system'" },
      { table: 'saved_recipes', column: 'recipe_name', ddl: 'VARCHAR(255) NULL' },
      { table: 'recipes', column: 'recipe_name', ddl: 'VARCHAR(255) NULL' }
    ];

    for (const { table, column, ddl } of checks) {
      try {
        const [rows]: any = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [table, column]
        );
        if (Array.isArray(rows) && rows.length === 0) {
          await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
        }
      } catch (_) {}
    }

    try {
      await connection.query(`UPDATE subscription_plans SET price = COALESCE(price_monthly, 0) WHERE price IS NULL`);
      await connection.query(`UPDATE token_packages SET price = COALESCE(price_monthly, 0) WHERE price IS NULL`);
      await connection.query(`UPDATE saved_recipes SET recipe_name = COALESCE(name, title, 'Delicious Recipe') WHERE recipe_name IS NULL`);
      await connection.query(`UPDATE recipes SET recipe_name = COALESCE(name, title, 'Delicious Recipe') WHERE recipe_name IS NULL`);
    } catch (_) {}

    await connection.end();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Self-healing entry point called safely by API routes
 */
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
