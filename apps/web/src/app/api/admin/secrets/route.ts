import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSetting, getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import { vaultEnabled, countPlaintextSecrets } from '@/lib/secretVault';

// Admin-only (proxy guard). Never returns secret values, only counts.
export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ success: true, vaultEnabled: vaultEnabled(), plaintextSecrets: plaintext, settingsWithPlaintext: affected });
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
    return NextResponse.json({ success: true, migratedSettings: migrated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Migration failed' }, { status: 500 });
  }
}
