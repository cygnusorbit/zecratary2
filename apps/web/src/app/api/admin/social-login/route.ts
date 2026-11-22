// @ts-nocheck
import { NextResponse } from 'next/server';
import { secureJson, restoreMaskedSecrets } from '@/lib/secretRedaction';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import fs from 'fs';
import path from 'path';
import { stripSecretsDeep } from '@/lib/secretVault';


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
export const revalidate = 0;

const DEFAULT_SETTINGS = {
  google: {
    enabled: true,
    environment: 'production',
    clientId: '',
    clientSecret: '',
    callbackUrl: '/api/auth/callback/google'
  },
  facebook: {
    enabled: true,
    environment: 'production',
    appId: '',
    appSecret: '',
    callbackUrl: '/api/auth/callback/facebook'
  },
  apple: {
    enabled: true,
    environment: 'production',
    clientId: '',
    teamId: '',
    keyId: '',
    privateKey: '',
    callbackUrl: '/api/auth/callback/apple'
  }
};

const DISK_FILES = [
  path.join(process.cwd(), 'apps', 'web', 'data', 'admin_settings.json'),
  path.join(process.cwd(), 'data', 'admin_settings.json'),
  path.join(process.cwd(), 'admin_settings.json')
];

function readDiskSettings() {
  for (const fp of DISK_FILES) {
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        const sl = parsed.socialLogin || parsed.settings?.socialLogin || parsed.social_login;
        if (sl) return sl;
      } catch (_) {}
    }
  }
  return DEFAULT_SETTINGS;
}

function writeDiskSettings(socialLogin: any) {
  for (const fp of DISK_FILES) {
    try {
      let existing: any = {};
      if (fs.existsSync(fp)) {
        try {
          existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        } catch (_) {
          existing = {};
        }
      } else {
        const dir = path.dirname(fp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }

      existing.socialLogin = socialLogin;
      existing.social_login = socialLogin;
      if (existing.settings && typeof existing.settings === 'object') {
        existing.settings.socialLogin = socialLogin;
      }

      fs.writeFileSync(fp, JSON.stringify(stripSecretsDeep(existing), null, 2), 'utf-8');
    } catch (_) {}
  }
}

export async function GET() {
  let dbSettings: any = null;
  try {
    dbSettings = await getJsonSetting('social_login');
  } catch (_) {}

  const finalSettings = dbSettings || readDiskSettings();
  return secureJson({
    socialLogin: {
      google: { ...DEFAULT_SETTINGS.google, ...(finalSettings.google || {}) },
      facebook: { ...DEFAULT_SETTINGS.facebook, ...(finalSettings.facebook || {}) },
      apple: { ...DEFAULT_SETTINGS.apple, ...(finalSettings.apple || {}) }
    }
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const incoming = body.socialLogin || body.settings?.socialLogin || body;
    {
      let currentSocial: any = null;
      try { currentSocial = await getJsonSetting('social_login'); } catch (_) {}
      restoreMaskedSecrets(incoming, currentSocial || readDiskSettings());
    }

    const merged = {
      google: { ...DEFAULT_SETTINGS.google, ...(incoming.google || {}) },
      facebook: { ...DEFAULT_SETTINGS.facebook, ...(incoming.facebook || {}) },
      apple: { ...DEFAULT_SETTINGS.apple, ...(incoming.apple || {}) }
    };

    // 1. Active database (MySQL or PostgreSQL)
    try {
      await setJsonSetting('social_login', merged, 'auth');
    } catch (_) {}

    // 2. Sync Disk Stores
    writeDiskSettings(merged);

    return secureJson({
      success: true,
      socialLogin: merged
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (err: any) {
    return secureJson({ error: err.message || 'Failed to persist settings' }, { status: 500 });
  }
}
