import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

const DEFAULT_SETTINGS = {
  tokenName: 'Foodie Token',
  tokenSymbol: '🪙',
  tokenIcon: '',
  startingBalance: 100,
  isEnabled: true,
  importUrlCost: 5,
  importTextCost: 2,
  importPhotoCost: 10,
  aiChefCost: 2,
  chefCost: 2,
  mealPlannerCost: 5,
  macroAnalysisCost: 3,
  planAllocations: { 'free': 50, 'nutrition-pro': 750, 'vip-chef': 3000 },
  packages: [
    { id: 'pkg_starter', name: 'Starter Spark', tokens: 250, tokenAmount: 250, price: 4.99, priceDollars: 4.99, badge: 'Popular', bonusTokens: 0, isPopular: true, description: 'Perfect for light exploration.' },
    { id: 'pkg_chef', name: 'Culinary Master', tokens: 1000, tokenAmount: 1000, price: 14.99, priceDollars: 14.99, badge: 'Best Value', bonusTokens: 150, bestValue: true, description: 'Our most popular bundle with generous bonus tokens.' },
    { id: 'pkg_executive', name: 'Kitchen Enterprise', tokens: 5000, tokenAmount: 5000, price: 49.99, priceDollars: 49.99, badge: 'VIP', bonusTokens: 1000, description: 'High-volume throughput.' }
  ]
};

function getSettingsPath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_settings.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_settings.json');
}

function getTransactionsPath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_transactions.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_transactions.json');
}

function readTokenSettings(): any {
  try {
    const fPath = getSettingsPath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

function saveTokenSettings(settings: any) {
  try {
    const fPath = getSettingsPath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (_) {}
}

function readTransactions(): any[] {
  try {
    const fPath = getTransactionsPath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const settings = readTokenSettings();
    const transactions = readTransactions();

    // 1. Dual-DB: PostgreSQL (Supabase)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dbData } = await supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'token_settings')
          .maybeSingle();

        if (dbData?.value) {
          const merged = { ...settings, ...dbData.value };
          return NextResponse.json({
            success: true,
            tokenSettings: merged,
            settings: merged,
            transactions,
            currencySymbol: '$',
            currency: 'USD'
          }, { headers: CORS_HEADERS });
        }
      } catch (_) {}
    }

    // 2. Dual-DB: MySQL
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        const rows: any = await mysqlModule.query("SELECT value FROM admin_settings WHERE `key` = 'token_settings' LIMIT 1");
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
          const dbObj = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
          const merged = { ...settings, ...dbObj };
          return NextResponse.json({
            success: true,
            tokenSettings: merged,
            settings: merged,
            transactions,
            currencySymbol: '$',
            currency: 'USD'
          }, { headers: CORS_HEADERS });
        }
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      tokenSettings: settings,
      settings,
      transactions,
      currencySymbol: '$',
      currency: 'USD'
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = readTokenSettings();
    const payload = body.tokenSettings || body.settings || body;
    const updated = {
      ...current,
      ...payload,
      updated_at: new Date().toISOString()
    };

    saveTokenSettings(updated);

    // Persist to PostgreSQL (Supabase)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from('admin_settings')
          .upsert({ key: 'token_settings', value: updated, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      } catch (_) {}
    }

    // Persist to MySQL
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        await mysqlModule.query(
          "INSERT INTO admin_settings (`key`, value, updated_at) VALUES ('token_settings', ?, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()",
          [JSON.stringify(updated)]
        );
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Token settings successfully synchronized with PostgreSQL & MySQL.',
      settings: updated,
      tokenSettings: updated
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE() {
  try {
    const fPath = getTransactionsPath();
    if (fs.existsSync(fPath)) {
      fs.writeFileSync(fPath, '[]', 'utf8');
    }

    // Clear PostgreSQL (Supabase)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('token_transactions').delete().neq('id', '0');
      } catch (_) {}
    }

    // Clear MySQL
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        await mysqlModule.query("TRUNCATE TABLE token_transactions").catch(() => {});
      }
    } catch (_) {}

    return NextResponse.json({ success: true, message: 'Ledger cleared successfully' }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
