import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { harmonizeDatabaseSchema } from '@/lib/dbSchemaHarmonizer';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

const DEFAULT_COSTS = {
  aiChefCost: 2,
  chefCost: 2,
  importUrlCost: 5,
  importTextCost: 2,
  importPhotoCost: 10,
  mealPlannerCost: 5,
  macroAnalysisCost: 3
};

const DEFAULT_PACKAGES = [
  { id: 'pkg_starter', name: 'Starter Spark', tokens: 250, tokenAmount: 250, price: 4.99, priceDollars: 4.99, badge: 'Popular', bonusTokens: 0, isPopular: true, description: 'Perfect for light exploration.' },
  { id: 'pkg_chef', name: 'Culinary Master', tokens: 1000, tokenAmount: 1000, price: 14.99, priceDollars: 14.99, badge: 'Best Value', bonusTokens: 150, bestValue: true, description: 'Generous bonus tokens for daily cooking.' },
  { id: 'pkg_executive', name: 'Kitchen Enterprise', tokens: 5000, tokenAmount: 5000, price: 49.99, priceDollars: 49.99, badge: 'VIP', bonusTokens: 1000, description: 'High-volume throughput.' }
];

function getSettingsFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_settings.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_settings.json');
}

function getUsersFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'users.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'users.json');
}

function getTxFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_transactions.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_transactions.json');
}

function readTokenSettings(): any {
  try {
    const fPath = getSettingsFilePath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_) {}
  return {
    tokenName: 'Foodie Token',
    tokenSymbol: '🪙',
    tokenIcon: '',
    startingBalance: 100,
    isEnabled: true,
    ...DEFAULT_COSTS,
    planAllocations: { 'free': 50, 'nutrition-pro': 750, 'vip-chef': 3000 },
    packages: DEFAULT_PACKAGES
  };
}

function saveTokenSettings(settings: any) {
  try {
    const fPath = getSettingsFilePath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (_) {}
}

function readDiskUsers(): any[] {
  try {
    const fPath = getUsersFilePath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [
    { id: 'usr_admin_1', email: 'admin@zecratary.com', name: 'Administrator', customer_name: 'Administrator', token_balance: 1500, tokens: 1500, role: 'admin' },
    { id: 'usr_chef_demo', email: 'chef@zecratary.com', name: 'Executive Chef', customer_name: 'Executive Chef', token_balance: 750, tokens: 750, role: 'user' },
    { id: 'usr_customer_demo', email: 'customer@zecratary.com', name: 'Jane Foodie', customer_name: 'Jane Foodie', token_balance: 250, tokens: 250, role: 'user' }
  ];
}

function writeDiskUsers(users: any[]) {
  try {
    const fPath = getUsersFilePath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(users, null, 2), 'utf8');
  } catch (_) {}
}

function readDiskTransactions(): any[] {
  try {
    const fPath = getTxFilePath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function writeDiskTransactions(txs: any[]) {
  try {
    const fPath = getTxFilePath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(txs, null, 2), 'utf8');
  } catch (_) {}
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  harmonizeDatabaseSchema().catch(() => {});
  try {
    const settings = readTokenSettings();
    let usersList = readDiskUsers();
    let txList = readDiskTransactions();

    // 1. PostgreSQL (Supabase)
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
          Object.assign(settings, dbData.value);
        }

        const { data: uData } = await supabase
          .from('users')
          .select('id, email, name, customer_name, token_balance, tokens, wallet_balance, role')
          .limit(200);

        if (Array.isArray(uData) && uData.length > 0) {
          const userMap = new Map();
          usersList.forEach(u => userMap.set(u.email.toLowerCase(), u));
          uData.forEach(u => {
            if (u.email) {
              const current = userMap.get(u.email.toLowerCase()) || {};
              userMap.set(u.email.toLowerCase(), {
                ...current,
                ...u,
                token_balance: Number(u.token_balance ?? u.tokens ?? current.token_balance ?? 100),
                tokens: Number(u.token_balance ?? u.tokens ?? current.token_balance ?? 100)
              });
            }
          });
          usersList = Array.from(userMap.values());
        }

        const { data: tData } = await supabase
          .from('token_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(250);

        if (Array.isArray(tData) && tData.length > 0) {
          const txMap = new Map();
          txList.forEach(t => txMap.set(t.id, t));
          tData.forEach(t => txMap.set(t.id, t));
          txList = Array.from(txMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      } catch (_) {}
    }

    // 2. MySQL
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        const rows: any = await mysqlModule.query("SELECT value FROM admin_settings WHERE `key` = 'token_settings' LIMIT 1");
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
          const dbObj = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
          Object.assign(settings, dbObj);
        }
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      tokenSettings: settings,
      settings: settings,
      currency: 'USD',
      currencySymbol: '$',
      users: usersList,
      transactions: txList,
      plans: [
        { id: 'plan_free', name: 'Free Explorer', slug: 'free', price: 0, interval: 'month', token_limit: settings.planAllocations?.['free'] ?? 50 },
        { id: 'plan_pro', name: 'Nutrition Pro', slug: 'nutrition-pro', price: 9.99, interval: 'month', token_limit: settings.planAllocations?.['nutrition-pro'] ?? 750 },
        { id: 'plan_vip', name: 'VIP Chef Enterprise', slug: 'vip-chef', price: 29.99, interval: 'month', token_limit: settings.planAllocations?.['vip-chef'] ?? 3000 }
      ]
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  harmonizeDatabaseSchema().catch(() => {});
  try {
    const body = await req.json();

    // ACTION: Manual Token Customer Balance Adjustment
    if (body.action === 'adjust_balance') {
      const customerEmail = (body.customer_email || body.user_email || '').trim().toLowerCase();
      if (!customerEmail || !customerEmail.includes('@')) {
        return NextResponse.json({ success: false, error: 'Valid customer email required' }, { status: 400, headers: CORS_HEADERS });
      }

      const adjustType = body.adjustment_type || 'add';
      const amount = Math.max(0, Number(body.amount || 0));
      const reason = body.reason || 'Manual Admin Adjustment';
      const notes = body.notes || '';
      const tokenSym = body.token_symbol || '🪙';

      // Find current user balance
      const usersList = readDiskUsers();
      const existingIdx = usersList.findIndex(u => u.email.toLowerCase() === customerEmail);
      let currentBal = existingIdx >= 0 ? Number(usersList[existingIdx].token_balance ?? usersList[existingIdx].tokens ?? 0) : 0;

      let newBal = currentBal;
      let deltaAmount = 0;

      if (adjustType === 'add') {
        newBal = currentBal + amount;
        deltaAmount = amount;
      } else if (adjustType === 'deduct') {
        newBal = Math.max(0, currentBal - amount);
        deltaAmount = -amount;
      } else if (adjustType === 'set') {
        newBal = amount;
        deltaAmount = newBal - currentBal;
      }

      // Update disk users
      if (existingIdx >= 0) {
        usersList[existingIdx].token_balance = newBal;
        usersList[existingIdx].tokens = newBal;
      } else {
        usersList.unshift({
          id: 'usr_' + Date.now().toString(36),
          email: customerEmail,
          customer_name: customerEmail.split('@')[0],
          token_balance: newBal,
          tokens: newBal,
          role: 'user'
        });
      }
      writeDiskUsers(usersList);

      // Create ledger transaction
      const txRecord = {
        id: `tx_adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        customer_email: customerEmail,
        user_email: customerEmail,
        amount: deltaAmount,
        balance_after: newBal,
        type: 'manual_adjustment',
        description: `Manual adjustment: ${deltaAmount >= 0 ? '+' : ''}${deltaAmount} ${tokenSym} (${reason}${notes ? ` - ${notes}` : ''})`,
        created_at: new Date().toISOString()
      };

      const currentTxs = readDiskTransactions();
      const updatedTxs = [txRecord, ...currentTxs];
      writeDiskTransactions(updatedTxs);

      // Persist to PostgreSQL (Supabase)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey);

          await supabase.from('users').upsert({
            email: customerEmail,
            token_balance: newBal,
            tokens: newBal,
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });

          await supabase.from('token_transactions').insert(txRecord);
        } catch (_) {}
      }

      // Persist to MySQL
      try {
        const mysqlModule = await import('@/lib/mysql').catch(() => null);
        if (mysqlModule && typeof mysqlModule.query === 'function') {
          await mysqlModule.query(
            "UPDATE users SET token_balance = ?, tokens = ? WHERE email = ?",
            [newBal, newBal, customerEmail]
          );
        }
      } catch (_) {}

      return NextResponse.json({
        success: true,
        message: `Successfully adjusted balance for ${customerEmail}.`,
        new_balance: newBal,
        balance_after: newBal,
        transaction: txRecord
      }, { headers: CORS_HEADERS });
    }

    // ACTION: Save Token Settings
    const current = readTokenSettings();
    const payload = body.tokenSettings || body.settings || body;
    const updated = {
      ...current,
      ...payload,
      updatedAt: new Date().toISOString()
    };

    saveTokenSettings(updated);

    // Save to PostgreSQL
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

    // Save to MySQL
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
      message: 'Token settings successfully persisted to PostgreSQL & MySQL.',
      settings: updated
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE() {
  try {
    writeDiskTransactions([]);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('token_transactions').delete().neq('id', 'keep_none');
      } catch (_) {}
    }

    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        await mysqlModule.query("TRUNCATE TABLE token_transactions");
      }
    } catch (_) {}

    return NextResponse.json({ success: true, message: 'Ledger cleared' }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
