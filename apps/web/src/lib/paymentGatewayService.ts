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
  gateways?: {
    stripe?: { enabled: boolean; mode?: string; publishableKey?: string; secretKey?: string };
    paypal?: { enabled: boolean; mode?: string; clientId?: string };
    manualSettlement?: ManualDetails;
  };
}

function getCandidateSeedPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/payment_gateways.json'),
    path.join(cwd, 'data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/apps/web/data/payment_gateways.json'),
    path.join(cwd, '.next/standalone/data/payment_gateways.json'),
  ];
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
    allowed_gateways: ['stripe', 'paypal', 'manual'],
    manual_details: {
      enabled: true,
      bankName: 'Silicon Valley Commercial Bank',
      accountHolder: 'Zecratary Inc.',
      accountNumber: '9842103891',
      swiftBic: 'SVCBUS6S',
      instructions: 'Please include your Transfer Reference ID in the transfer memo for prompt crediting.'
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

  // Also sync to standalone bundle if present
  const standaloneDir = path.join(process.cwd(), '.next/standalone/apps/web/data');
  if (fs.existsSync(standaloneDir)) {
    try {
      fs.writeFileSync(path.join(standaloneDir, 'payment_gateways.json'), JSON.stringify(settings, null, 2), 'utf-8');
    } catch (_) {}
  }
}

export function normalizeGatewaySettings(raw: any): PaymentGatewaySettings {
  const gateways = raw.gateways || raw.gatewaySettings || {};
  const allowed: string[] = [];

  // 1. Stripe Evaluation
  const stripeEnabled = raw.stripe_enabled !== undefined 
    ? Boolean(raw.stripe_enabled) 
    : (gateways.stripe?.enabled !== undefined ? Boolean(gateways.stripe.enabled) : true);
  if (stripeEnabled) allowed.push('stripe');

  // 2. PayPal Evaluation
  const paypalEnabled = raw.paypal_enabled !== undefined 
    ? Boolean(raw.paypal_enabled) 
    : (gateways.paypal?.enabled !== undefined ? Boolean(gateways.paypal.enabled) : true);
  if (paypalEnabled) allowed.push('paypal');

  // 3. Manual / Bank Wire Evaluation
  const manualObj = raw.manual_details || gateways.manualSettlement || gateways.bank_wire || {};
  const manualEnabled = manualObj.enabled !== undefined 
    ? Boolean(manualObj.enabled) 
    : (raw.manual_enabled !== undefined ? Boolean(raw.manual_enabled) : true);
  if (manualEnabled) allowed.push('manual');

  // 4. Incorporate explicitly provided allowed_gateways array if available
  if (Array.isArray(raw.allowed_gateways) && raw.allowed_gateways.length > 0) {
    for (const gw of raw.allowed_gateways) {
      const lower = String(gw).toLowerCase().trim();
      if ((lower === 'manual' || lower === 'manualsettlement' || lower === 'bank_wire') && !allowed.includes('manual')) {
        allowed.push('manual');
      } else if (lower === 'stripe' && !allowed.includes('stripe')) {
        allowed.push('stripe');
      } else if (lower === 'paypal' && !allowed.includes('paypal')) {
        allowed.push('paypal');
      }
    }
  }

  return {
    currency: raw.currency || 'USD',
    allowed_gateways: allowed,
    active_gateway: allowed[0] || 'stripe',
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
      instructions: manualObj.instructions || 'Please include your Transfer Reference ID in the transfer memo.'
    },
    gateways: {
      stripe: { enabled: stripeEnabled, mode: gateways.stripe?.mode || 'test' },
      paypal: { enabled: paypalEnabled, mode: gateways.paypal?.mode || 'sandbox' },
      manualSettlement: manualObj
    }
  };
}

/**
 * Unified Monorepo Payment Gateway Getter:
 * Checks PostgreSQL / Supabase, MySQL, and fallback disk cache.
 */
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
