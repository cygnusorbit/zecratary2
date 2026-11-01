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
}

export interface PaymentGatewaySettings {
  currency: string;
  allowed_gateways: string[];
  active_gateway?: string;
  stripe_configured?: boolean;
  paypal_configured?: boolean;
  test_mode?: boolean;
  manual_details?: ManualDetails;
  gateways: {
    stripe: { enabled: boolean; mode?: string; publishableKey?: string; secretKey?: string };
    paypal: { enabled: boolean; mode?: string; clientId?: string; clientSecret?: string };
    manualSettlement: ManualDetails;
  };
}

export const isFalseVal = (v: any): boolean =>
  v === false || v === 0 || v === 'false' || v === '0' || v === 'disabled' || v === 'inactive';

export const isTrueVal = (v: any): boolean =>
  v === true || v === 1 || v === 'true' || v === '1' || v === 'active' || v === 'enabled';

function getCandidateSeedPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/payment_gateways.json'),
    path.join(cwd, 'data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/apps/web/data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/data/payment_gateways.json'),
  ];
}

export function normalizeGatewaySettings(raw: any): PaymentGatewaySettings {
  const gateways = raw.gateways || raw.gatewaySettings || raw;

  // 1. Strict Stripe Evaluation
  let stripeEnabled = true;
  if (isFalseVal(gateways.stripe?.enabled) || isFalseVal(raw.stripe_enabled) || isFalseVal(raw.stripeEnabled)) {
    stripeEnabled = false;
  } else if (isTrueVal(gateways.stripe?.enabled) || isTrueVal(raw.stripe_enabled) || isTrueVal(raw.stripeEnabled)) {
    stripeEnabled = true;
  }

  // 2. Strict PayPal Evaluation
  let paypalEnabled = true;
  if (isFalseVal(gateways.paypal?.enabled) || isFalseVal(raw.paypal_enabled) || isFalseVal(raw.paypalEnabled)) {
    paypalEnabled = false;
  } else if (isTrueVal(gateways.paypal?.enabled) || isTrueVal(raw.paypal_enabled) || isTrueVal(raw.paypalEnabled)) {
    paypalEnabled = true;
  }

  // 3. Strict Manual / Bank Wire Evaluation
  const manualObj = raw.manual_details || gateways.manualSettlement || gateways.bank_wire || gateways.manual || {};
  let manualEnabled = true;
  if (isFalseVal(manualObj.enabled) || isFalseVal(raw.manual_enabled) || isFalseVal(raw.manualEnabled)) {
    manualEnabled = false;
  } else if (isTrueVal(manualObj.enabled) || isTrueVal(raw.manual_enabled) || isTrueVal(raw.manualEnabled)) {
    manualEnabled = true;
  }

  // 4. Construct Whitelist: Only channels whose enabled state is positively true
  const allowed: string[] = [];
  if (stripeEnabled) allowed.push('stripe');
  if (paypalEnabled) allowed.push('paypal');
  if (manualEnabled) allowed.push('manual');

  // 5. Intersect with raw.allowed_gateways if explicitly supplied
  if (Array.isArray(raw.allowed_gateways) && raw.allowed_gateways.length > 0) {
    const rawAllowed = raw.allowed_gateways.map((g: any) => {
      const lower = String(g).toLowerCase().trim();
      if (['manualsettlement', 'manual_settlement', 'bank_wire', 'wire'].includes(lower)) return 'manual';
      return lower;
    });
    // Strict intersection
    const filtered = allowed.filter(g => rawAllowed.includes(g));
    allowed.length = 0;
    allowed.push(...filtered);
  }

  return {
    currency: raw.currency || 'USD',
    allowed_gateways: allowed,
    active_gateway: allowed[0] || (stripeEnabled ? 'stripe' : allowed[0] || ''),
    stripe_configured: Boolean(gateways.stripe?.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY),
    paypal_configured: Boolean(gateways.paypal?.clientId || process.env.PAYPAL_CLIENT_ID),
    test_mode: Boolean(raw.test_mode || gateways.stripe?.mode === 'test'),
    manual_details: {
      enabled: manualEnabled,
      bankName: manualObj.bankName || 'Silicon Valley Commercial Bank',
      accountHolder: manualObj.accountHolder || 'Zecratary Inc.',
      accountNumber: manualObj.accountNumber || '9842103891',
      routingNumber: manualObj.routingNumber || '121000358',
      swiftBic: manualObj.swiftBic || 'SVCBUS6S',
      instructions: manualObj.instructions || 'Please include your Transfer Reference ID in the transfer memo for prompt crediting.'
    },
    gateways: {
      stripe: {
        enabled: stripeEnabled,
        mode: gateways.stripe?.mode || 'test',
        publishableKey: gateways.stripe?.publishableKey || '',
        secretKey: gateways.stripe?.secretKey || ''
      },
      paypal: {
        enabled: paypalEnabled,
        mode: gateways.paypal?.mode || 'sandbox',
        clientId: gateways.paypal?.clientId || '',
        clientSecret: gateways.paypal?.clientSecret || ''
      },
      manualSettlement: {
        enabled: manualEnabled,
        bankName: manualObj.bankName || 'Silicon Valley Commercial Bank',
        accountHolder: manualObj.accountHolder || 'Zecratary Inc.',
        accountNumber: manualObj.accountNumber || '9842103891',
        routingNumber: manualObj.routingNumber || '121000358',
        swiftBic: manualObj.swiftBic || 'SVCBUS6S',
        instructions: manualObj.instructions || 'Please include your Transfer Reference ID in the transfer memo.'
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
    gateways: {
      stripe: { enabled: true, mode: 'test' },
      paypal: { enabled: false, mode: 'sandbox' },
      manualSettlement: {
        enabled: true,
        bankName: 'Silicon Valley Commercial Bank',
        accountHolder: 'Zecratary Inc.',
        accountNumber: '9842103891'
      }
    },
    manual_details: {
      enabled: true,
      bankName: 'Silicon Valley Commercial Bank',
      accountHolder: 'Zecratary Inc.',
      accountNumber: '9842103891'
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
        settings = normalizeGatewaySettings(parsed);
        writeDiskGatewaySettings(settings);
      }
    } catch (_) {}
  }

  return settings;
}

export async function saveAuthoritativeGatewaySettings(input: any): Promise<PaymentGatewaySettings> {
  const normalized = normalizeGatewaySettings(input);
  writeDiskGatewaySettings(normalized);

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

  return normalized;
}
