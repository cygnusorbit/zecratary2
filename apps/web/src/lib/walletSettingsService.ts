import fs from 'fs';
import path from 'path';

export interface BonusRule {
  threshold: number;
  bonus_percent: number;
}

export interface WalletAdminConfig {
  is_enabled: boolean;
  currency: string;
  min_topup: number;
  max_topup: number;
  preset_amounts: number[];
  bonus_rules: BonusRule[];
  allowed_gateways: string[];
  allow_site_purchases: boolean;
  test_mode?: boolean;
}

function getCandidateWalletConfigPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/wallet_settings.json'),
    path.join(cwd, 'data/wallet_settings.json'),
    path.join(cwd, '.next/standalone/apps/web/data/wallet_settings.json'),
    path.join(cwd, '.next/standalone/data/wallet_settings.json'),
  ];
}

export const DEFAULT_WALLET_CONFIG: WalletAdminConfig = {
  is_enabled: true,
  currency: 'USD',
  min_topup: 5,
  max_topup: 1000,
  preset_amounts: [10, 25, 50, 100, 250],
  bonus_rules: [
    { threshold: 50, bonus_percent: 5 },
    { threshold: 100, bonus_percent: 10 }
  ],
  allowed_gateways: ['stripe', 'paypal', 'manual'],
  allow_site_purchases: true,
  test_mode: false
};

export function readDiskWalletConfig(): WalletAdminConfig {
  for (const p of getCandidateWalletConfigPaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            ...DEFAULT_WALLET_CONFIG,
            ...parsed,
            preset_amounts: Array.isArray(parsed.preset_amounts) && parsed.preset_amounts.length > 0 
              ? parsed.preset_amounts.map(Number) 
              : DEFAULT_WALLET_CONFIG.preset_amounts,
            bonus_rules: Array.isArray(parsed.bonus_rules) 
              ? parsed.bonus_rules 
              : DEFAULT_WALLET_CONFIG.bonus_rules
          };
        }
      } catch (_) {}
    }
  }
  return DEFAULT_WALLET_CONFIG;
}

export function writeDiskWalletConfig(cfg: WalletAdminConfig): void {
  const targetDir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
  }
  const targetPath = path.join(targetDir, 'wallet_settings.json');
  try {
    fs.writeFileSync(targetPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (_) {}

  const standaloneDir = path.join(process.cwd(), '.next/standalone/apps/web/data');
  if (fs.existsSync(standaloneDir)) {
    try {
      fs.writeFileSync(path.join(standaloneDir, 'wallet_settings.json'), JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (_) {}
  }
}

export async function getAuthoritativeWalletConfig(): Promise<WalletAdminConfig> {
  let config = readDiskWalletConfig();

  // 1. PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('setting_key', 'wallet_settings')
        .maybeSingle();

      if (!error && data?.setting_value) {
        const parsed = typeof data.setting_value === 'string' 
          ? JSON.parse(data.setting_value) 
          : data.setting_value;
        config = { ...config, ...parsed };
        writeDiskWalletConfig(config);
      }
    } catch (_) {}
  }

  // 2. MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query(
        "SELECT setting_value, value FROM admin_settings WHERE setting_key = 'wallet_settings' LIMIT 1"
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const raw = rows[0].setting_value || rows[0].value;
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          config = { ...config, ...parsed };
          writeDiskWalletConfig(config);
        }
      }
    }
  } catch (_) {}

  return config;
}

export async function saveAuthoritativeWalletConfig(newConfig: Partial<WalletAdminConfig>): Promise<WalletAdminConfig> {
  const current = await getAuthoritativeWalletConfig();
  const merged: WalletAdminConfig = {
    ...current,
    ...newConfig,
    preset_amounts: Array.isArray(newConfig.preset_amounts) && newConfig.preset_amounts.length > 0
      ? newConfig.preset_amounts.map(Number)
      : current.preset_amounts,
    bonus_rules: Array.isArray(newConfig.bonus_rules)
      ? newConfig.bonus_rules
      : current.bonus_rules
  };

  writeDiskWalletConfig(merged);

  // 1. PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from('admin_settings')
        .upsert({
          setting_key: 'wallet_settings',
          setting_value: JSON.stringify(merged),
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });
    } catch (_) {}
  }

  // 2. MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query(
        `INSERT INTO admin_settings (id, setting_key, setting_value, value, updated_at)
         VALUES ('set_wallet_cfg', 'wallet_settings', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), value = VALUES(value), updated_at = NOW()`,
        [JSON.stringify(merged), JSON.stringify(merged)]
      );
    }
  } catch (_) {}

  return merged;
}
