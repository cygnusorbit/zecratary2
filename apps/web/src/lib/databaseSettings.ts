import fs from 'fs';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import path from 'path';
import { stripSecretsDeep } from '@/lib/secretVault';

export interface SocialLoginConfig {
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  facebookEnabled: boolean;
  facebookAppId: string;
  facebookAppSecret: string;
  appleEnabled: boolean;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
}

export function getDefaultSocialSettings(): SocialLoginConfig {
  return {
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET || '',
    facebookEnabled: Boolean(process.env.FACEBOOK_APP_ID),
    facebookAppId: process.env.FACEBOOK_APP_ID || '',
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET || '',
    appleEnabled: Boolean(process.env.APPLE_TEAM_ID),
    appleTeamId: process.env.APPLE_TEAM_ID || '',
    appleKeyId: process.env.APPLE_KEY_ID || '',
    applePrivateKey: process.env.APPLE_PRIVATE_KEY || ''
  };
}

export function readSettingsFromFile(): any {
  const cwd = process.cwd();
  const fileCandidates = [
    path.join(cwd, 'apps/web/data/admin_settings.json'),
    path.join(cwd, 'data/admin_settings.json')
  ];

  for (const fp of fileCandidates) {
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
  }
  return {};
}

export function writeSettingsToFile(data: any): void {
  const cwd = process.cwd();
  const fileCandidates = [
    path.join(cwd, 'apps/web/data/admin_settings.json'),
    path.join(cwd, 'data/admin_settings.json')
  ];

  for (const fp of fileCandidates) {
    try {
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify(stripSecretsDeep(data), null, 2), 'utf-8');
    } catch (_) {}
  }
}

// -------------------------------------------------------------
// Active-database storage (key `social_login`, shared with /api/admin/social-login)
// The admin page saves a nested shape: { google: {...}, facebook: {...}, apple: {...} }.
// This module exposes the flat SocialLoginConfig, so convert in both directions.
// -------------------------------------------------------------
function isNested(v: any): boolean {
  return !!v && typeof v === 'object' && (v.google || v.facebook || v.apple);
}

function nestedToFlat(n: any): Partial<SocialLoginConfig> {
  const g = n.google || {};
  const f = n.facebook || {};
  const a = n.apple || {};
  const out: any = {};
  if (typeof g.enabled === 'boolean') out.googleEnabled = g.enabled;
  if (g.clientId) out.googleClientId = g.clientId;
  if (g.clientSecret) out.googleClientSecret = g.clientSecret;
  if (typeof f.enabled === 'boolean') out.facebookEnabled = f.enabled;
  if (f.appId) out.facebookAppId = f.appId;
  if (f.appSecret) out.facebookAppSecret = f.appSecret;
  if (typeof a.enabled === 'boolean') out.appleEnabled = a.enabled;
  if (a.teamId) out.appleTeamId = a.teamId;
  if (a.keyId) out.appleKeyId = a.keyId;
  if (a.privateKey) out.applePrivateKey = a.privateKey;
  return out;
}

function flatToNested(c: Partial<SocialLoginConfig>, base: any): any {
  const next: any = { google: { ...(base?.google || {}) }, facebook: { ...(base?.facebook || {}) }, apple: { ...(base?.apple || {}) } };
  if (c.googleEnabled !== undefined) next.google.enabled = c.googleEnabled;
  if (c.googleClientId !== undefined) next.google.clientId = c.googleClientId;
  if (c.googleClientSecret !== undefined) next.google.clientSecret = c.googleClientSecret;
  if (c.facebookEnabled !== undefined) next.facebook.enabled = c.facebookEnabled;
  if (c.facebookAppId !== undefined) next.facebook.appId = c.facebookAppId;
  if (c.facebookAppSecret !== undefined) next.facebook.appSecret = c.facebookAppSecret;
  if (c.appleEnabled !== undefined) next.apple.enabled = c.appleEnabled;
  if (c.appleTeamId !== undefined) next.apple.teamId = c.appleTeamId;
  if (c.appleKeyId !== undefined) next.apple.keyId = c.appleKeyId;
  if (c.applePrivateKey !== undefined) next.apple.privateKey = c.applePrivateKey;
  return next;
}

export async function getPersistedSocialSettings(): Promise<SocialLoginConfig> {
  const defaults = getDefaultSocialSettings();
  const fileSettings = readSettingsFromFile();
  const fromFile = fileSettings.socialLogin;
  let merged: SocialLoginConfig = {
    ...defaults,
    ...(isNested(fromFile) ? nestedToFlat(fromFile) : (fromFile || {}))
  };

  try {
    const stored = await getJsonSetting<any>('social_login');
    if (stored && typeof stored === 'object') {
      merged = { ...merged, ...(isNested(stored) ? nestedToFlat(stored) : stored) };
    }
  } catch (_) {
    // Graceful fallback to file / environment values
  }

  return merged;
}

export async function savePersistedSocialSettings(config: SocialLoginConfig): Promise<void> {
  let base: any = null;
  try {
    base = await getJsonSetting<any>('social_login');
  } catch (_) {}
  const nested = flatToNested(config, isNested(base) ? base : null);

  // File replication (nested, same shape the admin page writes)
  const current = readSettingsFromFile();
  current.socialLogin = nested;
  writeSettingsToFile(current);

  try {
    await setJsonSetting('social_login', nested, 'auth');
  } catch (err) {
    console.warn('[DB] Social settings update warning:', err);
  }
}
