import { getMysqlPool } from './mysql';
import { createClient } from '@supabase/supabase-js';

export interface MigrationSummary {
  success: boolean;
  totalTables: number;
  totalRowsMigrated: number;
  details: Record<string, { rows: number; status: string; error?: string }>;
  error?: string;
}

export const MIGRATION_TABLES = [
  'admin_settings',
  'currencies',
  'subscription_plans',
  'token_packages',
  'token_settings',
  'users',
  'user_profiles',
  'user_wallets',
  'user_tokens',
  'recipes',
  'saved_recipes',
  'payment_transactions',
  'meal_plans',
  'grocery_items',
  'frontend_pages',
  'page_contents',
  'app_translations',
  'notifications',
  'audit_logs'
];

function sanitizeValueForMysql(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return null;
    }
  }
  return val;
}

export async function migrateSupabaseToMysql(): Promise<MigrationSummary> {
  const mysqlPool = getMysqlPool();
  if (!mysqlPool) {
    return {
      success: false,
      totalTables: 0,
      totalRowsMigrated: 0,
      details: {},
      error: 'Hostinger MySQL connection pool is not available. Check MYSQL_URL.'
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tnhrkjtujdfgvwhsuuxb.supabase.co';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const details: Record<string, { rows: number; status: string; error?: string }> = {};
  let totalRowsMigrated = 0;

  for (const tableName of MIGRATION_TABLES) {
    try {
      const { data: rows, error: pgErr } = await supabase
        .from(tableName)
        .select('*')
        .limit(5000);

      if (pgErr) {
        details[tableName] = { rows: 0, status: 'Skipped (Supabase table not found or restricted)' };
        continue;
      }

      if (!rows || rows.length === 0) {
        details[tableName] = { rows: 0, status: 'Completed (0 rows in Supabase)' };
        continue;
      }

      let insertedCount = 0;
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;

        const colList = keys.map(k => '`' + k + '`').join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const updateAssignments = keys
          .filter(k => k.toLowerCase() !== 'id')
          .map(k => '`' + k + '` = VALUES(`' + k + '`)')
          .join(', ');

        const values = keys.map(k => sanitizeValueForMysql(row[k]));

        let sql = 'INSERT INTO `' + tableName + '` (' + colList + ') VALUES (' + placeholders + ')';
        if (updateAssignments.length > 0) {
          sql += ' ON DUPLICATE KEY UPDATE ' + updateAssignments;
        }

        try {
          await mysqlPool.execute(sql, values);
          insertedCount++;
        } catch (insertErr: any) {
          console.warn(`[Migrator] Notice inserting row in ${tableName}:`, insertErr.message);
        }
      }

      details[tableName] = { rows: insertedCount, status: 'Synchronized' };
      totalRowsMigrated += insertedCount;
    } catch (tblErr: any) {
      details[tableName] = { rows: 0, status: 'Error', error: tblErr.message };
    }
  }

  return {
    success: true,
    totalTables: MIGRATION_TABLES.length,
    totalRowsMigrated,
    details
  };
}

export default migrateSupabaseToMysql;
