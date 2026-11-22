import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import { maskSecret, isMasked } from '@/lib/adminGuard';

// AI provider keys for the admin AI page.
// - Admin-only (guarded in proxy via lib/adminAuth, reads included).
// - Only a fixed list of AI key names is ever read or written. Other environment values (database URLs, session secret, ...) are never touched.
// - The browser only ever receives masked values; the real value stays on the server.
export const dynamic = 'force-dynamic';

const STORE_KEY = 'ai_api_keys';
const ALLOWED = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY'];

interface StoredKey { name?: string; provider?: string; apiKey?: string; value?: string; status?: string; updatedAt?: string }
type KeyBook = Record<string, StoredKey>;

async function loadBook(): Promise<KeyBook> {
  try { return (await getJsonSetting<KeyBook>(STORE_KEY)) || {}; } catch (_) { return {}; }
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET() {
  try {
    const book = await loadBook();
    const envMap: Record<string, string> = {};
    const keys: any[] = [];

    for (const name of ALLOWED) {
      const fromEnv = (process.env[name] || '').trim();
      const stored = book[name];
      const value = (stored && (stored.apiKey || stored.value)) || fromEnv;
      if (value) envMap[name] = maskSecret(value);
      if (stored && (stored.apiKey || stored.value)) {
        keys.push({
          id: name,
          name: stored.name || name,
          provider: stored.provider || (name.includes('PEXELS') || name.includes('UNSPLASH') ? 'image' : name.includes('OPENAI') ? 'openai' : name.includes('ANTHROPIC') ? 'anthropic' : 'gemini'),
          envKey: name,
          keyValue: maskSecret(stored.apiKey || stored.value || ''),
          status: stored.status || 'active',
        });
      }
    }
    return NextResponse.json({ success: true, keys, envMap }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to load keys' }, { status: 500 });
  }
}

function updateLocalEnvFile(filePath: string, key: string, value: string) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}='${value}'`;
  if (regex.test(content)) content = content.replace(regex, line);
  else {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += line + '\n';
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || 'gemini');
    const envKey = String(body.envKey || (provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY')).trim();
    const value = String(body.keyValue || '').trim();

    if (!ALLOWED.includes(envKey)) {
      return NextResponse.json({ success: false, error: 'That key name is not allowed.' }, { status: 400 });
    }
    // A masked value means "unchanged": nothing to save.
    if (!value || isMasked(value)) {
      return NextResponse.json({ success: true, message: 'Key unchanged.' });
    }
    if (value.length < 10 || value.length > 500 || /[\r\n']/.test(value)) {
      return NextResponse.json({ success: false, error: 'That does not look like a valid API key.' }, { status: 400 });
    }

    const book = await loadBook();
    book[envKey] = {
      name: body.name || book[envKey]?.name || envKey,
      provider,
      apiKey: value,
      status: body.status || 'active',
      updatedAt: new Date().toISOString(),
    };
    if (envKey === 'GEMINI_API_KEY') book['GOOGLE_API_KEY'] = { ...book[envKey] };
    await setJsonSetting(STORE_KEY, book, 'ai');

    // Make it take effect immediately for this running server.
    process.env[envKey] = value;
    if (envKey === 'GEMINI_API_KEY') process.env['GOOGLE_API_KEY'] = value;

    // Local development only: also keep the dev .env.local in step. Production uses the hosting panel's variables.
    if (process.env.NODE_ENV !== 'production') {
      const cwd = process.cwd();
      const target = fs.existsSync(path.join(cwd, 'apps', 'web')) ? path.join(cwd, 'apps', 'web', '.env.local') : path.join(cwd, '.env.local');
      try { updateLocalEnvFile(target, envKey, value); } catch (_) {}
    }

    return NextResponse.json({ success: true, message: `Key saved (${envKey}).` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Save failed' }, { status: 500 });
  }
}
