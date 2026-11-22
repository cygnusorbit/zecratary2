import { query } from '@/lib/db';
import { ensureAiUsageTable } from '@/lib/aiUsageSchema';

export interface LogAiUsageParams {
  provider?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  cost?: number;
  latencyMs?: number;
  source?: string;
  userId?: string | null;
  userEmail?: string | null;
}

export async function logAiUsageTelemetry(params: LogAiUsageParams) {
  const provider = (params.provider || 'gemini').toLowerCase();
  const model = params.model || 'gemini-2.5-flash';
  const promptTokens = Math.max(0, Math.round(params.promptTokens || 0));
  const completionTokens = Math.max(0, Math.round(params.completionTokens || 0));
  const totalTokens = params.totalTokens || (promptTokens + completionTokens);
  const latencyMs = Math.max(0, Math.round(params.latencyMs || 0));
  const source = params.source || 'chef';

  // Calculate standard Gemini cost: ~$0.075 / 1M prompt, $0.30 / 1M completion
  const calculatedCost = params.cost !== undefined ? params.cost : 
    parseFloat(((promptTokens * 0.075 + completionTokens * 0.3) / 1000000).toFixed(6));

  try {
    // 1. Ensure the table exists (dialect-aware: MySQL/MariaDB or PostgreSQL)
    await ensureAiUsageTable();

    const id = 'ai_usg_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    // 2. Insert record
    await query(`
      INSERT INTO ai_usage_telemetry (
        id, provider, model, prompt_tokens, completion_tokens,
        total_tokens, cost, latency_ms, source, user_id, user_email, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `, [
      id,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      calculatedCost,
      latencyMs,
      source,
      params.userId || null,
      params.userEmail || null
    ]);

    return { success: true, id };
  } catch (err) {
    console.warn('[aiUsageLogger] Failed to persist usage record:', err);
    return { success: false, error: err };
  }
}
