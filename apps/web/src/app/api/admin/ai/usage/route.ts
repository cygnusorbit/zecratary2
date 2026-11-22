import { NextRequest, NextResponse } from 'next/server';
import { query, getDatabaseDialect } from '@/lib/db';
import { ensureAiUsageTable } from '@/lib/aiUsageSchema';

export const dynamic = 'force-dynamic';

interface UsagePoint {
  date: string;
  dayLabel: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

interface Bucket {
  requests: number;
  prompt: number;
  completion: number;
  cost: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = (searchParams.get('timeframe') || '7d') as '24h' | '7d' | '30d';
    const provider = searchParams.get('provider') || 'gemini';

    await ensureAiUsageTable();

    // Window is computed in SQL so it works on both MySQL/MariaDB and PostgreSQL.
    const hours = timeframe === '24h' ? 24 : timeframe === '30d' ? 30 * 24 : 7 * 24;
    const since = getDatabaseDialect() === 'mysql'
      ? `created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR)`
      : `created_at >= NOW() - INTERVAL '${hours} hours'`;

    const rows: any[] = await query(
      `SELECT created_at, prompt_tokens, completion_tokens, cost FROM ai_usage_telemetry WHERE ${since} ORDER BY created_at ASC LIMIT 100000`
    );

    const keyHour = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    const keyDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const keyOf = timeframe === '24h' ? keyHour : keyDay;

    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) continue;
      const k = keyOf(d);
      const b = buckets.get(k) || { requests: 0, prompt: 0, completion: 0, cost: 0 };
      b.requests += 1;
      b.prompt += Number(r.prompt_tokens) || 0;
      b.completion += Number(r.completion_tokens) || 0;
      b.cost += Number(r.cost) || 0;
      buckets.set(k, b);
    }

    const now = new Date();
    const points: UsagePoint[] = [];

    if (timeframe === '24h') {
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 3600 * 1000);
        const b = buckets.get(keyHour(d));
        points.push({
          date: d.toISOString(),
          dayLabel: `${d.getHours().toString().padStart(2, '0')}:00`,
          requests: b ? b.requests : 0,
          promptTokens: b ? b.prompt : 0,
          completionTokens: b ? b.completion : 0,
          cost: b ? parseFloat(b.cost.toFixed(4)) : 0
        });
      }
    } else {
      const numDays = timeframe === '30d' ? 30 : 7;
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
        const b = buckets.get(keyDay(d));
        points.push({
          date: d.toISOString(),
          dayLabel: d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }),
          requests: b ? b.requests : 0,
          promptTokens: b ? b.prompt : 0,
          completionTokens: b ? b.completion : 0,
          cost: b ? parseFloat(b.cost.toFixed(4)) : 0
        });
      }
    }

    // Fallback from token_transactions if the telemetry table is still empty (kept from previous behaviour).
    const totalRequests = points.reduce((acc, p) => acc + p.requests, 0);
    if (totalRequests === 0) {
      try {
        const txRows: any[] = await query(`
          SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as tot
          FROM token_transactions
          WHERE type LIKE 'usage_%'
        `);
        if (txRows.length > 0 && parseInt(txRows[0].cnt, 10) > 0) {
          const count = parseInt(txRows[0].cnt, 10);
          const lastPoint = points[points.length - 1];
          if (lastPoint) {
            lastPoint.requests = count;
            lastPoint.promptTokens = count * 350;
            lastPoint.completionTokens = count * 180;
            lastPoint.cost = parseFloat(((lastPoint.promptTokens * 0.075 + lastPoint.completionTokens * 0.3) / 1000000).toFixed(4));
          }
        }
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      timeframe,
      provider,
      points,
      totalRequests: points.reduce((acc, p) => acc + p.requests, 0),
      totalPromptTokens: points.reduce((acc, p) => acc + p.promptTokens, 0),
      totalCompletionTokens: points.reduce((acc, p) => acc + p.completionTokens, 0),
      totalCost: points.reduce((acc, p) => acc + p.cost, 0)
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
