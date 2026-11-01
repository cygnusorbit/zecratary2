import fs from 'fs';
import path from 'path';

export interface ManualDetails {
  enabled?: boolean;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftBic?: string;
  branchName?: string;
  instructions?: string;
  requireReference?: boolean;
  requireApproval?: boolean;
}

export interface PaymentGatewaySettings {
  currency: string;
  allowed_gateways: string[];
  verified_gateways: string[];
  active_gateway?: string;
  stripeConnected?: boolean;
  stripe_configured?: boolean;
  paypal_configured?: boolean;
  stripeKeysVerified: boolean;
  stripeWebhookVerified: boolean;
  paypalKeysVerified: boolean;
  paypalWebhookVerified: boolean;
  test_mode?: boolean;
  manual_details?: ManualDetails;
  gateways: {
    stripe: { 
      enabled: boolean; 
      mode?: string; 
      testMode?: boolean; 
      publishableKey?: string; 
      secretKey?: string; 
      webhookSecret?: string;
      keysVerified?: boolean;
      webhookVerified?: boolean;
    };
    paypal: { 
      enabled: boolean; 
      mode?: string; 
      testMode?: boolean; 
      clientId?: string; 
      clientSecret?: string; 
      webhookId?: string; 
      environment?: 'sandbox' | 'live';
      keysVerified?: boolean;
      webhookVerified?: boolean;
    };
    manualSettlement: ManualDetails;
  };
}

export const isFalseVal = (v: any): boolean =>
  v === false || v === 0 || v === 'false' || v === '0' || v === 'disabled' || v === 'inactive' || v === 'off' || v === 'no';

export const isTrueVal = (v: any): boolean =>
  v === true || v === 1 || v === 'true' || v === '1' || v === 'active' || v === 'enabled' || v === 'on' || v === 'yes';

function getCandidateSeedPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/payment_gateways.json'),
    path.join(cwd, 'data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/apps/web/data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/data/payment_gateways.json'),
  ];
}

export function normalizeGatewaySettings(raw: any, existingSettings?: PaymentGatewaySettings): PaymentGatewaySettings {
  if (!raw || typeof raw !== 'object') {
    return existingSettings || readDiskGatewaySettings();
  }

  const source = raw.paymentSettings || raw.settings || raw.gateways || raw.gatewaySettings || raw;
  const stripeObj = source.stripe || raw.stripe || {};
  const paypalObj = source.paypal || raw.paypal || {};
  const manualObj = source.manualSettlement || source.manual || source.bank_wire || raw.manual_details || raw.manualSettlement || {};

  const isToggle = raw.action === 'toggle_gateway';
  const toggleGw = String(raw.gateway || '').toLowerCase().trim();
  const toggleEnabled = raw.enabled !== undefined ? isTrueVal(raw.enabled) : undefined;

  // Stripe Enabled Evaluation
  let stripeEnabled = true;
  if (isToggle && toggleGw === 'stripe' && toggleEnabled !== undefined) {
    stripeEnabled = toggleEnabled;
  } else if (isFalseVal(stripeObj.enabled) || isFalseVal(raw.stripe_enabled) || isFalseVal(raw.stripeEnabled) || isFalseVal(source.stripe_enabled)) {
    stripeEnabled = false;
  } else if (isTrueVal(stripeObj.enabled) || isTrueVal(raw.stripe_enabled) || isTrueVal(raw.stripeEnabled) || isTrueVal(source.stripe_enabled)) {
    stripeEnabled = true;
  } else if (existingSettings) {
    stripeEnabled = existingSettings.gateways.stripe.enabled;
  }

  // PayPal Enabled Evaluation
  let paypalEnabled = false;
  if (isToggle && toggleGw === 'paypal' && toggleEnabled !== undefined) {
    paypalEnabled = toggleEnabled;
  } else if (isFalseVal(paypalObj.enabled) || isFalseVal(raw.paypal_enabled) || isFalseVal(raw.paypalEnabled) || isFalseVal(source.paypal_enabled)) {
    paypalEnabled = false;
  } else if (isTrueVal(paypalObj.enabled) || isTrueVal(raw.paypal_enabled) || isTrueVal(raw.paypalEnabled) || isTrueVal(source.paypal_enabled)) {
    paypalEnabled = true;
  } else if (existingSettings) {
    paypalEnabled = existingSettings.gateways.paypal.enabled;
  }

  // Manual Settlement Evaluation
  let manualEnabled = true;
  if (isToggle && (toggleGw === 'manual' || toggleGw === 'bank_wire' || toggleGw === 'manualsettlement') && toggleEnabled !== undefined) {
    manualEnabled = toggleEnabled;
  } else if (isFalseVal(manualObj.enabled) || isFalseVal(raw.manual_enabled) || isFalseVal(raw.manualEnabled) || isFalseVal(source.manual_enabled)) {
    manualEnabled = false;
  } else if (isTrueVal(manualObj.enabled) || isTrueVal(raw.manual_enabled) || isTrueVal(raw.manualEnabled) || isTrueVal(source.manual_enabled)) {
    manualEnabled = true;
  } else if (existingSettings) {
    manualEnabled = existingSettings.gateways.manualSettlement.enabled ?? true;
  }

  // Verification Flags Persistence
  const stripeKeysVerified = raw.stripeKeysVerified !== undefined
    ? isTrueVal(raw.stripeKeysVerified)
    : (source.stripeKeysVerified !== undefined
      ? isTrueVal(source.stripeKeysVerified)
      : (stripeObj.keysVerified !== undefined
        ? isTrueVal(stripeObj.keysVerified)
        : (existingSettings?.stripeKeysVerified ?? false)));

  const stripeWebhookVerified = raw.stripeWebhookVerified !== undefined
    ? isTrueVal(raw.stripeWebhookVerified)
    : (source.stripeWebhookVerified !== undefined
      ? isTrueVal(source.stripeWebhookVerified)
      : (existingSettings?.stripeWebhookVerified ?? false));

  const paypalKeysVerified = raw.paypalKeysVerified !== undefined
    ? isTrueVal(raw.paypalKeysVerified)
    : (source.paypalKeysVerified !== undefined
      ? isTrueVal(source.paypalKeysVerified)
      : (paypalObj.keysVerified !== undefined
        ? isTrueVal(paypalObj.keysVerified)
        : (existingSettings?.paypalKeysVerified ?? false)));

  const paypalWebhookVerified = raw.paypalWebhookVerified !== undefined
    ? isTrueVal(raw.paypalWebhookVerified)
    : (source.paypalWebhookVerified !== undefined
      ? isTrueVal(source.paypalWebhookVerified)
      : (existingSettings?.paypalWebhookVerified ?? false));

  // Allowed channels
  const allowed: string[] = [];
  if (stripeEnabled) allowed.push('stripe');
  if (paypalEnabled) allowed.push('paypal');
  if (manualEnabled) allowed.push('manual');

  const rawAllowed = raw.allowed_gateways || source.allowed_gateways;
  if (Array.isArray(rawAllowed) && rawAllowed.length > 0 && !isToggle) {
    const normalizedRaw = rawAllowed.map((g: any) => {
      const lower = String(g).toLowerCase().trim();
      if (['manualsettlement', 'manual_settlement', 'bank_wire', 'wire'].includes(lower)) return 'manual';
      return lower;
    });
    const filtered = allowed.filter(g => normalizedRaw.includes(g));
    allowed.length = 0;
    allowed.push(...filtered);
  }

  // Verified channels (Strictly authenticated channels)
  const verified: string[] = [];
  if (stripeEnabled && stripeKeysVerified) verified.push('stripe');
  if (paypalEnabled && paypalKeysVerified) verified.push('paypal');
  if (manualEnabled) verified.push('manual'); // Bank wire has no API keys and is verified by nature

  const activeGw = (stripeEnabled && paypalEnabled)
    ? 'both'
    : stripeEnabled
    ? 'stripe'
    : paypalEnabled
    ? 'paypal'
    : manualEnabled
    ? 'manual'
    : 'none';

  const stripeTest = stripeObj.testMode !== undefined ? isTrueVal(stripeObj.testMode) : (raw.stripeTestMode !== undefined ? isTrueVal(raw.stripeTestMode) : true);
  const paypalTest = paypalObj.testMode !== undefined ? isTrueVal(paypalObj.testMode) : (raw.paypalTestMode !== undefined ? isTrueVal(raw.paypalTestMode) : true);

  return {
    currency: source.currency || raw.currency || existingSettings?.currency || 'USD',
    allowed_gateways: allowed,
    verified_gateways: verified,
    active_gateway: source.activeGateway || raw.activeGateway || activeGw,
    stripeConnected: source.stripeConnected ?? raw.stripeConnected ?? existingSettings?.stripeConnected ?? true,
    stripe_configured: Boolean(stripeObj.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY),
    paypal_configured: Boolean(paypalObj.clientId || process.env.PAYPAL_CLIENT_ID),
    stripeKeysVerified,
    stripeWebhookVerified,
    paypalKeysVerified,
    paypalWebhookVerified,
    test_mode: stripeTest,
    manual_details: {
      enabled: manualEnabled,
      bankName: manualObj.bankName || 'Bangkok Bank',
      accountHolder: manualObj.accountHolder || 'Zecratary Culinary Ltd',
      accountNumber: manualObj.accountNumber || '123-4-56789-0',
      routingNumber: manualObj.routingNumber || '002',
      swiftBic: manualObj.swiftBic || 'BKKBTHBK',
      branchName: manualObj.branchName || 'Siam Paragon Branch',
      instructions: manualObj.instructions || 'Please transfer the exact amount and upload your reference slip.',
      requireReference: manualObj.requireReference ?? true,
      requireApproval: manualObj.requireApproval ?? true
    },
    gateways: {
      stripe: {
        enabled: stripeEnabled,
        mode: stripeTest ? 'test' : 'live',
        testMode: stripeTest,
        publishableKey: stripeObj.publishableKey || '',
        secretKey: stripeObj.secretKey || '',
        webhookSecret: stripeObj.webhookSecret || '',
        keysVerified: stripeKeysVerified,
        webhookVerified: stripeWebhookVerified
      },
      paypal: {
        enabled: paypalEnabled,
        mode: paypalTest ? 'sandbox' : 'live',
        testMode: paypalTest,
        clientId: paypalObj.clientId || '',
        clientSecret: paypalObj.clientSecret || '',
        webhookId: paypalObj.webhookId || '',
        environment: paypalTest ? 'sandbox' : 'live',
        keysVerified: paypalKeysVerified,
        webhookVerified: paypalWebhookVerified
      },
      manualSettlement: {
        enabled: manualEnabled,
        bankName: manualObj.bankName || 'Bangkok Bank',
        accountHolder: manualObj.accountHolder || 'Zecratary Culinary Ltd',
        accountNumber: manualObj.accountNumber || '123-4-56789-0',
        routingNumber: manualObj.routingNumber || '002',
        swiftBic: manualObj.swiftBic || 'BKKBTHBK',
        branchName: manualObj.branchName || 'Siam Paragon Branch',
        instructions: manualObj.instructions || 'Please transfer the exact amount and upload your reference slip.',
        requireReference: manualObj.requireReference ?? true,
        requireApproval: manualObj.requireApproval ?? true
      }
    }
  };
}

export function readDiskGatewaySettings(): PaymentGatewaySettings {
  for (const p of getCandidateSeedPaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return normalizeGatewaySettings(parsed);
        }
      } catch (_) {}
    }
  }

  return {
    currency: 'USD',
    allowed_gateways: ['stripe', 'manual'],
    verified_gateways: ['manual'],
    active_gateway: 'stripe',
    stripeConnected: true,
    stripe_configured: false,
    paypal_configured: false,
    stripeKeysVerified: false,
    stripeWebhookVerified: false,
    paypalKeysVerified: false,
    paypalWebhookVerified: false,
    test_mode: true,
    gateways: {
      stripe: { enabled: true, mode: 'test', testMode: true, publishableKey: '', secretKey: '', keysVerified: false },
      paypal: { enabled: false, mode: 'sandbox', testMode: true, clientId: '', clientSecret: '', environment: 'sandbox', keysVerified: false },
      manualSettlement: {
        enabled: true,
        bankName: 'Bangkok Bank',
        accountHolder: 'Zecratary Culinary Ltd',
        accountNumber: '123-4-56789-0'
      }
    },
    manual_details: {
      enabled: true,
      bankName: 'Bangkok Bank',
      accountHolder: 'Zecratary Culinary Ltd',
      accountNumber: '123-4-56789-0'
    }
  };
}

export function writeDiskGatewaySettings(settings: PaymentGatewaySettings): void {
  const targetDir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
  }
  const targetPath = path.join(targetDir, 'payment_gateways.json');
  try {
    fs.writeFileSync(targetPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (_) {}

  const standaloneDir = path.join(process.cwd(), '.next/standalone/apps/web/data');
  if (fs.existsSync(standaloneDir)) {
    try {
      fs.writeFileSync(path.join(standaloneDir, 'payment_gateways.json'), JSON.stringify(settings, null, 2), 'utf-8');
    } catch (_) {}
  }
}

export async function getAuthoritativeGatewaySettings(): Promise<PaymentGatewaySettings> {
  let settings = readDiskGatewaySettings();

  // PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('setting_key', 'payment_gateways')
        .maybeSingle();

      if (!error && data?.setting_value) {
        const parsed = typeof data.setting_value === 'string' 
          ? JSON.parse(data.setting_value) 
          : data.setting_value;
        settings = normalizeGatewaySettings(parsed, settings);
        writeDiskGatewaySettings(settings);
        return settings;
      }
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query(
        "SELECT setting_value FROM admin_settings WHERE setting_key = 'payment_gateways' LIMIT 1"
      );
      if (Array.isArray(rows) && rows.length > 0 && rows[0].setting_value) {
        const parsed = typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value;
        settings = normalizeGatewaySettings(parsed, settings);
        writeDiskGatewaySettings(settings);
      }
    }
  } catch (_) {}

  return settings;
}

export async function saveAuthoritativeGatewaySettings(input: any): Promise<PaymentGatewaySettings> {
  const current = await getAuthoritativeGatewaySettings();
  const normalized = normalizeGatewaySettings(input, current);
  writeDiskGatewaySettings(normalized);

  // PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from('admin_settings')
        .upsert({
          setting_key: 'payment_gateways',
          setting_value: JSON.stringify(normalized),
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at) 
         VALUES ('payment_gateways', ?, NOW()) 
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
        [JSON.stringify(normalized)]
      );
    }
  } catch (_) {}

  return normalized;
}
