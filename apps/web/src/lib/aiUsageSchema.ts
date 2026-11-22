import { query, getDatabaseDialect } from '@/lib/db';

declare global {
  var __zecratary_ai_usage_ready: string | undefined;
}

export async function ensureAiUsageTable(): Promise<void> {
  const dialect = getDatabaseDialect();
  if (globalThis.__zecratary_ai_usage_ready === dialect) return;

  if (dialect === 'mysql') {
    await query(`
      CREATE TABLE IF NOT EXISTS ai_usage_telemetry (
        id VARCHAR(64) PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        model VARCHAR(64) NOT NULL,
        prompt_tokens INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens INT NOT NULL DEFAULT 0,
        cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
        latency_ms INT DEFAULT 0,
        source VARCHAR(64) DEFAULT 'chef',
        user_id VARCHAR(64),
        user_email VARCHAR(128),
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_usage_created (created_at),
        INDEX idx_ai_usage_provider (provider)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } else {
    await query(`
      CREATE TABLE IF NOT EXISTS ai_usage_telemetry (
        id VARCHAR(64) PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        model VARCHAR(64) NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        source VARCHAR(64) DEFAULT 'chef',
        user_id VARCHAR(64),
        user_email VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_telemetry(created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage_telemetry(provider)');
  }

  globalThis.__zecratary_ai_usage_ready = dialect;
}
