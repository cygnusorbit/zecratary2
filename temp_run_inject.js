
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  let uri = process.env.MYSQL_URL;
  if (!uri) {
    const envPaths = ['.env.local', '.env', 'apps/web/.env.local'];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const lines = fs.readFileSync(p, 'utf-8').split('\n');
        for (const l of lines) {
          if (l.trim().startsWith('MYSQL_URL=')) {
            uri = l.trim().split('=')[1].replace(/^["']|["']$/g, '');
            break;
          }
        }
      }
      if (uri) break;
    }
  }

  if (!uri) {
    console.log('[Notice] MYSQL_URL not populated in current shell. Standalone CLI injection skipped; injector is ready for runtime execution.');
    process.exit(0);
  }

  console.log('[*] Connecting to MySQL...');
  try {
    const conn = await mysql.createConnection(uri);
    console.log('[✓] Successfully connected to MySQL database.');

    const tables = [
      'admin_settings', 'users', 'user_profiles', 'subscription_plans',
      'token_packages', 'token_settings', 'user_tokens', 'payment_transactions',
      'user_wallets', 'saved_recipes', 'recipes', 'meal_plans',
      'grocery_items', 'currencies', 'frontend_pages', 'notifications', 'audit_logs'
    ];

    // Read injector code statements
    const tsFile = fs.readFileSync('apps/web/src/lib/mysqlSchemaInjector.ts', 'utf-8');
    const ddls = tsFile.match(/CREATE TABLE IF NOT EXISTS [\s\S]*?\) ENGINE=InnoDB[^;]*;/g) || [];

    for (const ddl of ddls) {
      await conn.query(ddl);
    }
    console.log(`[✓] Injected all ${ddls.length} operational table schemas into MySQL.`);

    // Verify existing tables
    const [rows] = await conn.query('SHOW TABLES');
    console.log(`[✓] Live MySQL Catalog currently contains ${rows.length} tables.`);

    await conn.end();
  } catch (err) {
    console.warn('[!] Direct connection notice:', err.message);
  }
}

run();
