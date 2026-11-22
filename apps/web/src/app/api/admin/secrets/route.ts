import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSetting, getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import { vaultEnabled, countPlaintextSecrets, stripSecretsDeep } from '@/lib/secretVault';
import fs from 'fs';
import path from 'path';

// Admin-only (proxy guard). Never returns secret values, only counts.
export const dynamic = 'force-dynamic';

const FILE_PATHS = () => [
  path.join(process.cwd(), 'apps', 'web', 'data', 'admin_settings.json'),
  path.join(process.cwd(), 'data', 'admin_settings.json'),
];

function readJsonFile(p: string): any | null {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch (_) { return null; }
}

// Plaintext secrets still sitting in the local JSON mirror (names of the files only).
function plaintextInFiles(): number {
  let n = 0;
  for (const p of FILE_PATHS()) { const d = readJsonFile(p); if (d) n += countPlaintextSecrets(d); }
  return n;
}

// Storage settings used to live only in the local file. Move them into the encrypted database store, then clear the secrets from the file.
async function importFileStorageSettings(): Promise<boolean> {
  let imported = false;
  const existing = await getJsonSetting<any>('storage_settings').catch(() => null);
  for (const p of FILE_PATHS()) {
    const d = readJsonFile(p);
    if (!d) continue;
    for (const k of ['storage_settings', 'storageSettings']) {
      const obj = d[k];
      if (!obj || typeof obj !== 'object') continue;
      if (!existing && !imported) { await setJsonSetting('storage_settings', obj, 'storage'); imported = true; }
      d[k] = stripSecretsDeep(obj);
    }
    try { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); } catch (_) {}
  }
  return imported;
}

async function settingKeys(): Promise<string[]> {
  const rows = await query<any>('SELECT setting_key FROM admin_settings');
  return (rows || []).map((r: any) => String(r.setting_key)).filter(Boolean);
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

// Status: is the vault on, and how many secret fields are still in clear text in the database?
export async function GET() {
  try {
    let plaintext = 0;
    const affected: string[] = [];
    for (const key of await settingKeys()) {
      const raw = await getSetting(key);
      if (!raw) continue;
      try {
        const n = countPlaintextSecrets(JSON.parse(raw));
        if (n > 0) { plaintext += n; affected.push(key); }
      } catch (_) {}
    }
    return NextResponse.json({ success: true, vaultEnabled: vaultEnabled(), plaintextSecrets: plaintext, settingsWithPlaintext: affected, plaintextInLocalFiles: plaintextInFiles() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed' }, { status: 500 });
  }
}

// One-time migration: re-save every JSON setting so secrets are written encrypted.
export async function POST() {
  if (!vaultEnabled()) {
    return NextResponse.json({ success: false, error: 'Set SECRETS_KEY (32+ characters) in the server environment first.' }, { status: 400 });
  }
  try {
    let migrated = 0;
    const storageImported = await importFileStorageSettings();
    for (const key of await settingKeys()) {
      const raw = await getSetting(key);
      if (!raw) continue;
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch (_) { continue; }
      if (countPlaintextSecrets(parsed) === 0) continue;
      const value = await getJsonSetting(key);
      if (value === null) continue;
      await setJsonSetting(key, value);
      migrated++;
    }
    return NextResponse.json({ success: true, migratedSettings: migrated, storageImported });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Migration failed' }, { status: 500 });
  }
}
