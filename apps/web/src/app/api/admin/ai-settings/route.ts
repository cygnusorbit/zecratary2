import { NextRequest, NextResponse } from 'next/server';
import { getServerAdminSettings } from '@/lib/serverSettings';
import { setJsonSetting } from '@/lib/adminSettingsStore';
import { restoreMaskedSecrets, redactSecrets, secureJson } from '@/lib/secretRedaction';

// AI settings (provider, model, chef AI options). They live inside the shared "site_config" setting,
// the same place /admin/settings and the chef read from. Writes are admin-only (proxy guard); secrets are never returned.
export const dynamic = 'force-dynamic';

const PROVIDERS = ['gemini', 'openai', 'anthropic'];


// Recipe source URLs: only plain http(s) addresses, no duplicates, at most 20.
function cleanSourceUrls(v: any): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    let t = String(item || '').trim();
    if (!t || t.length > 500) continue;
    if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
    try {
      const u = new URL(t);
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) continue;
      u.hash = '';
      const s = u.toString();
      if (!out.includes(s)) out.push(s);
    } catch (_) {}
    if (out.length >= 20) break;
  }
  return out;
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

function view(settings: any) {
  const chef = settings?.chefAiSettings || {};
  return redactSecrets({
    ai_provider: settings?.aiProvider || chef.provider || 'gemini',
    ai_model: settings?.aiModel || chef.model || 'gemini-3.5-flash-lite',
    chefAiSettings: chef,
  });
}

export async function GET() {
  try {
    return secureJson({ success: true, settings: view(await getServerAdminSettings()) });
  } catch (err: any) {
    return secureJson({ success: false, error: err?.message || 'Failed to load AI settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 200_000) return secureJson({ success: false, error: 'Payload too large' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch (_) { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return secureJson({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const provider = body.aiProvider ?? body.ai_provider;
    const model = body.aiModel ?? body.ai_model;
    if (provider !== undefined && !PROVIDERS.includes(String(provider).toLowerCase())) {
      return secureJson({ success: false, error: 'Unknown AI provider.' }, { status: 400 });
    }
    if (model !== undefined && (typeof model !== 'string' || !model.trim() || model.length > 100)) {
      return secureJson({ success: false, error: 'Invalid model name.' }, { status: 400 });
    }
    if (body.chefAiSettings !== undefined && (typeof body.chefAiSettings !== 'object' || body.chefAiSettings === null || Array.isArray(body.chefAiSettings))) {
      return secureJson({ success: false, error: 'Invalid chefAiSettings.' }, { status: 400 });
    }

    const current = await getServerAdminSettings();
    const incomingChef = body.chefAiSettings ? { ...body.chefAiSettings } : undefined;
    if (incomingChef && incomingChef.recommendedRecipeUrls !== undefined) {
      const cleaned = cleanSourceUrls(incomingChef.recommendedRecipeUrls);
      if (cleaned === null) return secureJson({ success: false, error: 'Recommended recipe URLs must be a list.' }, { status: 400 });
      incomingChef.recommendedRecipeUrls = cleaned;
    }
    const topLevelUrls = body.recommendedRecipeUrls !== undefined ? cleanSourceUrls(body.recommendedRecipeUrls) : undefined;
    if (incomingChef) restoreMaskedSecrets(incomingChef, current?.chefAiSettings || {});

    const merged = { ...current };
    if (provider !== undefined) merged.aiProvider = String(provider).toLowerCase();
    if (model !== undefined) merged.aiModel = String(model).trim();
    if (incomingChef) {
      merged.chefAiSettings = { ...(current?.chefAiSettings || {}), ...incomingChef };
      if (provider !== undefined) merged.chefAiSettings.provider = merged.aiProvider;
      if (model !== undefined) merged.chefAiSettings.model = merged.aiModel;
    } else if (provider !== undefined || model !== undefined) {
      merged.chefAiSettings = { ...(current?.chefAiSettings || {}) };
      if (provider !== undefined) merged.chefAiSettings.provider = merged.aiProvider;
      if (model !== undefined) merged.chefAiSettings.model = merged.aiModel;
    }

    if (topLevelUrls) merged.recommendedRecipeUrls = topLevelUrls;
    else if (incomingChef && Array.isArray(incomingChef.recommendedRecipeUrls)) merged.recommendedRecipeUrls = incomingChef.recommendedRecipeUrls;
    await setJsonSetting('site_config', merged, 'general');
    return secureJson({ success: true, settings: view(merged) });
  } catch (err: any) {
    return secureJson({ success: false, error: err?.message || 'Save failed' }, { status: 500 });
  }
}
