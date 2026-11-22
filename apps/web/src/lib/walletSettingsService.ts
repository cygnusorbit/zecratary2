import fs from 'fs';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
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

  // Active database (MySQL or PostgreSQL) via the shared admin_settings store
  try {
    const stored = await getJsonSetting<any>('wallet_settings');
    if (stored && typeof stored === 'object') {
      config = { ...config, ...stored };
      writeDiskWalletConfig(config);
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

  try {
    await setJsonSetting('wallet_settings', merged, 'wallet');
  } catch (_) {}

  return merged;
}
