import { NextRequest, NextResponse } from 'next/server';
import { isMasked } from '@/lib/adminGuard';
import { getStoredChefApiKey } from '@/lib/serverSettings';
import fs from 'fs';
import path from 'path';


// Module-scoped type-safe database row extractors (unexported to prevent Next.js TS2344)
function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function parseDbRow<T = any>(res: any): T | null {
  const rows = parseDbRows<T>(res);
  return rows.length > 0 ? rows[0] : null;
}


export const dynamic = 'force-dynamic';

let cachedPool: any = null;

async function getPostgresPool() {
  if (cachedPool) return cachedPool;
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!connStr) return null;
  try {
    const { Pool } = await import('pg');
    const requiresSsl = connStr.includes('sslmode=require') || 
                        connStr.includes('neon.tech') || 
                        connStr.includes('supabase.co') || 
                        process.env.NODE_ENV === 'production';
    cachedPool = new Pool({
      connectionString: connStr,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false
    });
    return cachedPool;
  } catch (err) {
    return null;
  }
}

function cleanCredential(val?: string): string {
  if (!val) return '';
  return val.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/^["']|["']$/g, '').trim();
}

async function resolveKey(provider: string, explicitKey?: string): Promise<string> {
  const clean = isMasked(explicitKey) ? '' : cleanCredential(explicitKey);
  if (clean && clean.length > 5 && !clean.includes('sample')) return clean;

  const savedKey = await getStoredChefApiKey(provider);
  if (savedKey && !savedKey.includes('sample')) return savedKey;

  const targetEnv = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  const pool = await getPostgresPool();

  if (pool) {
    try {
      const res = await pool.query('SELECT key_value FROM admin_api_keys WHERE env_key = $1 LIMIT 1;', [targetEnv]);
      if (res.rows && res.rows[0]?.key_value) {
        const k = cleanCredential(res.rows[0].key_value);
        if (k && !k.includes('sample')) return k;
      }
    } catch (_) {}

    try {
      const sRes = await pool.query('SELECT chef_ai_settings, value FROM admin_settings LIMIT 1;');
      if (sRes.rows && sRes.rows[0]) {
        const row = sRes.rows[0];
        let chef = row.chef_ai_settings || row.value?.chefAiSettings || {};
        if (typeof chef === 'string') {
          try { chef = JSON.parse(chef); } catch (_) { chef = {}; }
        }
        if (chef.apiKey) {
          const k = cleanCredential(chef.apiKey);
          if (k && !k.includes('sample')) return k;
        }
      }
    } catch (_) {}
  }

  const cwd = process.cwd();
  const envPaths = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, 'apps', 'web', '.env'),
    path.join(cwd, 'apps', 'web', '.env.local')
  ];

  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const lines = fs.readFileSync(ep, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith(`${targetEnv}=`)) {
            const rawVal = trimmed.substring(`${targetEnv}=`.length);
            const k = cleanCredential(rawVal);
            if (k && !k.includes('sample')) return k;
          }
        }
      } catch (_) {}
    }
  }

  return cleanCredential(process.env[targetEnv] || process.env['GOOGLE_API_KEY']);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const provider = body.provider || 'gemini';
    const cleanKey = await resolveKey(provider, body.apiKey);
    const requestedModel = cleanCredential(body.model);

    if (!cleanKey) {
      return NextResponse.json(
        { success: false, error: `No active API key provided or found in database for ${provider}.` },
        { status: 400 }
      );
    }

    if (provider === 'gemini') {
      let catalogModels: any[] = [];
      try {
        const catRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const catData = await catRes.json().catch(() => ({}));
        if (catRes.ok && Array.isArray(catData.models)) {
          catalogModels = catData.models
            .filter((m: any) => {
              const name = m.name || '';
              const methods = m.supportedGenerationMethods || [];
              const isGen = methods.includes('generateContent') || methods.length === 0;
              const isEmb = name.includes('embedding') || name.includes('aqa') || name.includes('imagen');
              return isGen && !isEmb;
            })
            .map((m: any) => {
              const rawId = (m.name || '').replace(/^models\//, '');
              return {
                id: rawId,
                name: m.displayName || rawId,
                label: `${m.displayName || rawId} (${rawId})`,
                description: m.description || 'Google Gemini production model.'
              };
            });
        }
      } catch (_) {}

      // Prioritized verification ping using requested model first
      const pingCandidate = requestedModel || (catalogModels.length > 0 ? catalogModels[0].id : 'gemini-2.5-flash');
      const testModelsToTry = Array.from(new Set([pingCandidate, 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-1.5-flash']));
      let pingSuccess = false;
      let confirmedModel = pingCandidate;
      let lastErrMsg = '';

      for (const tModel of testModelsToTry) {
        try {
          const testRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${tModel}:generateContent?key=${cleanKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'ping' }] }],
                generationConfig: { maxOutputTokens: 5 }
              })
            }
          );
          const testData = await testRes.json().catch(() => ({}));
          if (testRes.ok && (testData.candidates || testData.promptFeedback)) {
            pingSuccess = true;
            confirmedModel = tModel;
            break;
          } else {
            lastErrMsg = testData.error?.message || `HTTP ${testRes.status}`;
          }
        } catch (e: any) {
          lastErrMsg = e.message;
        }
      }

      if (!pingSuccess && catalogModels.length === 0) {
        return NextResponse.json({ success: false, error: lastErrMsg || 'Gemini handshake failed.' }, { status: 400 });
      }

      // Preserve existing selected model in PostgreSQL while syncing available models catalog
      const pool = await getPostgresPool();
      if (pool && catalogModels.length > 0) {
        try {
          const res = await pool.query('SELECT * FROM admin_settings LIMIT 1;');
          if (res.rows && res.rows.length > 0) {
            const row = res.rows[0];
            let chef = row.chef_ai_settings;
            if (typeof chef === 'string') {
              try { chef = JSON.parse(chef); } catch (_) { chef = {}; }
            }
            chef = chef || {};
            chef.availableGeminiModels = catalogModels;
            await pool.query(
              `UPDATE admin_settings 
               SET chef_ai_settings = $1::jsonb,
                   value = jsonb_set(COALESCE(value, '{}'::jsonb), '{chefAiSettings,availableGeminiModels}', $2::jsonb),
                   updated_at = NOW() 
               WHERE id = $3;`,
              [JSON.stringify(chef), JSON.stringify(catalogModels), row.id]
            );
          }
        } catch (_) {}
      }

      return NextResponse.json({
        success: true,
        message: `Connected to Google Gemini successfully! (${catalogModels.length} models synced)`,
        models: catalogModels.length > 0 ? catalogModels : undefined,
        testedModel: requestedModel || confirmedModel
      });
    }

    // OpenAI provider check
    if (provider === 'openai') {
      const openAiRes = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` }
      });
      const openAiData = await openAiRes.json().catch(() => ({}));

      if (!openAiRes.ok) {
        return NextResponse.json({ success: false, error: openAiData.error?.message || 'OpenAI verification failed.' }, { status: 400 });
      }

      let openAiModels: any[] = [];
      if (Array.isArray(openAiData.data)) {
        openAiModels = openAiData.data
          .filter((m: any) => m.id && (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('chatgpt')))
          .map((m: any) => ({
            id: m.id,
            name: m.id,
            label: `${m.id.toUpperCase()}`,
            description: 'OpenAI GPT Model.'
          }));
      }

      return NextResponse.json({
        success: true,
        message: `Connected to OpenAI successfully! (${openAiModels.length} models synced)`,
        models: openAiModels.length > 0 ? openAiModels : undefined,
        testedModel: requestedModel || 'gpt-4o'
      });
    }

    return NextResponse.json({ success: false, error: 'Unsupported provider' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal connection test failure.' }, { status: 500 });
  }
}
