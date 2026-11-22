import fs from 'fs';
import path from 'path';
import { getJsonSetting } from '@/lib/adminSettingsStore';
import { isMasked } from '@/lib/adminGuard';

// SERVER-ONLY access to the full (unredacted) site settings.
// API routes must read settings through this module, never by fetching /api/admin/settings:
// that endpoint is public and returns masked secrets, and a relative fetch() cannot run on the server anyway.

function localCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/admin_settings.json'),
    path.join(cwd, 'data/admin_settings.json'),
    path.join(cwd, '.next/standalone/apps/web/data/admin_settings.json'),
    path.join(cwd, '.next/standalone/data/admin_settings.json'),
  ];
}

export function readLocalAdminSettings(): any {
  for (const p of localCandidates()) {
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }
  return {};
}

export async function getServerAdminSettings(): Promise<any> {
  const local = readLocalAdminSettings();
  try {
    const stored = await getJsonSetting<any>('site_config');
    if (stored && typeof stored === 'object') return { ...local, ...stored };
  } catch (_) {}
  return local;
}

// The AI key saved in /admin/ai-settings for the given provider ('' if none or a different provider).
export async function getStoredChefApiKey(provider: string): Promise<string> {
  const settings = await getServerAdminSettings();
  const chef = settings?.chefAiSettings || settings?.chef_ai_settings || {};
  const key = typeof chef.apiKey === 'string' ? chef.apiKey.trim() : '';
  if (!key || isMasked(key)) return '';
  const chefProvider = String(chef.provider || settings?.aiProvider || 'gemini').toLowerCase();
  return chefProvider === String(provider || 'gemini').toLowerCase() ? key : '';
}
