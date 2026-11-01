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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return [];
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
    let txList = readDiskTransactions();
    const userMap = new Map<string, any>();

    // 1. Seed with disk users (if any)
    const diskUsers = readDiskUsers();
    diskUsers.forEach(u => {
      if (u.email) {
        userMap.set(u.email.toLowerCase().trim(), {
          ...u,
          email: u.email.toLowerCase().trim(),
          token_balance: Number(u.token_balance ?? u.tokens ?? 0),
          tokens: Number(u.token_balance ?? u.tokens ?? 0)
        });
      }
    });

    // 2. Query Supabase PostgreSQL for users and transactions
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
          .limit(300);

        if (Array.isArray(uData) && uData.length > 0) {
          uData.forEach(u => {
            if (u.email) {
              const eKey = u.email.toLowerCase().trim();
              const existing = userMap.get(eKey) || {};
              const rawBal = u.token_balance !== undefined && u.token_balance !== null 
                ? u.token_balance 
                : (u.tokens !== undefined && u.tokens !== null ? u.tokens : existing.token_balance);
              const numBal = rawBal !== undefined && rawBal !== null && !isNaN(Number(rawBal)) ? Number(rawBal) : 0;
              userMap.set(eKey, {
                ...existing,
                ...u,
                email: eKey,
                token_balance: numBal,
                tokens: numBal
              });
            }
          });
        }

        const { data: tData } = await supabase
          .from('token_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);

        if (Array.isArray(tData) && tData.length > 0) {
          const txMap = new Map();
          txList.forEach(t => txMap.set(t.id, t));
          tData.forEach(t => txMap.set(t.id, t));
          txList = Array.from(txMap.values());
        }
      } catch (_) {}
    }

    // 3. Query MySQL for users and settings
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        const rows: any = await mysqlModule.query("SELECT value, setting_value FROM admin_settings WHERE `key` = 'token_settings' OR setting_key = 'token_settings' LIMIT 1");
        if (Array.isArray(rows) && rows.length > 0) {
          const val = rows[0].value || rows[0].setting_value;
          if (val) {
            const dbObj = typeof val === 'string' ? JSON.parse(val) : val;
            Object.assign(settings, dbObj);
          }
        }

        // Query MySQL users table
        const myUsers: any = await mysqlModule.query("SELECT id, email, name, customer_name, token_balance, tokens, wallet_balance, role FROM users LIMIT 300").catch(() => null);
        if (Array.isArray(myUsers) && myUsers.length > 0) {
          myUsers.forEach((u: any) => {
            if (u.email) {
              const eKey = u.email.toLowerCase().trim();
              const existing = userMap.get(eKey) || {};
              const rawBal = u.token_balance !== undefined && u.token_balance !== null
                ? u.token_balance
                : (u.tokens !== undefined && u.tokens !== null ? u.tokens : existing.token_balance);
              const numBal = rawBal !== undefined && rawBal !== null && !isNaN(Number(rawBal)) ? Number(rawBal) : 0;
              userMap.set(eKey, {
                ...existing,
                ...u,
                email: eKey,
                token_balance: numBal,
                tokens: numBal
              });
            }
          });
        }

        // Query MySQL token_transactions table
        const myTxs: any = await mysqlModule.query("SELECT * FROM token_transactions ORDER BY created_at DESC LIMIT 300").catch(() => null);
        if (Array.isArray(myTxs) && myTxs.length > 0) {
          const txMap = new Map();
          txList.forEach(t => txMap.set(t.id, t));
          myTxs.forEach((t: any) => txMap.set(t.id, t));
          txList = Array.from(txMap.values());
        }
      }
    } catch (_) {}

    // 4. Ensure default active administrators exist if directory is empty
    if (userMap.size === 0) {
      userMap.set('admin@zecratary.com', {
        id: 'usr_admin_1',
        email: 'admin@zecratary.com',
        name: 'Administrator',
        customer_name: 'Administrator',
        token_balance: Number(settings.startingBalance || 100),
        tokens: Number(settings.startingBalance || 100),
        role: 'admin'
      });
    }

    // Sort transactions by timestamp
    txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 5. Authoritative Ledger Balance Reconciliation per Customer
    // Scan all transactions for each user: the latest transaction's balance_after is the authoritative ledger balance
    const userLatestBalance = new Map<string, number>();
    const userLedgerSum = new Map<string, number>();

    txList.forEach(tx => {
      const emailKey = (tx.customer_email || tx.user_email || '').toLowerCase().trim();
      if (!emailKey) return;

      // Track ledger sum
      const currentSum = userLedgerSum.get(emailKey) || 0;
      userLedgerSum.set(emailKey, currentSum + Number(tx.amount || 0));

      // Record latest balance_after if not yet set (since txList is sorted newest-to-oldest)
      if (!userLatestBalance.has(emailKey) && tx.balance_after !== undefined && tx.balance_after !== null && !isNaN(Number(tx.balance_after))) {
        userLatestBalance.set(emailKey, Number(tx.balance_after));
      }

      // If user is not yet in directory, discover them from ledger
      if (!userMap.has(emailKey)) {
        userMap.set(emailKey, {
          id: 'usr_' + Math.random().toString(36).substring(2, 7),
          email: emailKey,
          customer_name: emailKey.split('@')[0],
          name: emailKey.split('@')[0],
          token_balance: 0,
          tokens: 0,
          role: 'user'
        });
      }
    });

    // 6. Harmonize each user's token balance with the authoritative system ledger
    const finalUsersList = Array.from(userMap.values()).map(u => {
      const eKey = u.email.toLowerCase().trim();
      let authoritativeBalance = Number(u.token_balance ?? u.tokens ?? 0);

      if (userLatestBalance.has(eKey)) {
        authoritativeBalance = userLatestBalance.get(eKey)!;
      } else if (userLedgerSum.has(eKey)) {
        authoritativeBalance = Math.max(0, userLedgerSum.get(eKey)!);
      }

      return {
        ...u,
        token_balance: authoritativeBalance,
        tokens: authoritativeBalance
      };
    });

    // Sort alphabetically by email
    finalUsersList.sort((a, b) => a.email.localeCompare(b.email));

    // Mirror to disk
    writeDiskUsers(finalUsersList);
    writeDiskTransactions(txList);

    return NextResponse.json({
      success: true,
      tokenSettings: settings,
      settings: settings,
      currency: 'USD',
      currencySymbol: '$',
      users: finalUsersList,
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

      // 1. Authoritative Current Balance Discovery
      let currentBal = 0;
      let foundUser = false;

      // Check existing transactions first for latest balance_after
      const allTxs = readDiskTransactions();
      const userLatestTx = allTxs.find(t => (t.customer_email || t.user_email || '').toLowerCase().trim() === customerEmail);
      if (userLatestTx && userLatestTx.balance_after !== undefined && !isNaN(Number(userLatestTx.balance_after))) {
        currentBal = Number(userLatestTx.balance_after);
        foundUser = true;
      }

      // Check PostgreSQL (Supabase) users table
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!foundUser && supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data: uDb } = await supabase.from('users').select('token_balance, tokens').eq('email', customerEmail).maybeSingle();
          if (uDb) {
            const raw = uDb.token_balance !== undefined ? uDb.token_balance : uDb.tokens;
            if (raw !== null && raw !== undefined && !isNaN(Number(raw))) {
              currentBal = Number(raw);
              foundUser = true;
            }
          }
        } catch (_) {}
      }

      // Check MySQL users table
      if (!foundUser) {
        try {
          const mysqlModule = await import('@/lib/mysql').catch(() => null);
          if (mysqlModule && typeof mysqlModule.query === 'function') {
            const mRows: any = await mysqlModule.query("SELECT token_balance, tokens FROM users WHERE email = ? LIMIT 1", [customerEmail]);
            if (Array.isArray(mRows) && mRows.length > 0) {
              const raw = mRows[0].token_balance !== undefined ? mRows[0].token_balance : mRows[0].tokens;
              if (raw !== null && raw !== undefined && !isNaN(Number(raw))) {
                currentBal = Number(raw);
                foundUser = true;
              }
            }
          }
        } catch (_) {}
      }

      // Check disk users fallback
      if (!foundUser) {
        const dUsers = readDiskUsers();
        const dMatch = dUsers.find(u => u.email && u.email.toLowerCase().trim() === customerEmail);
        if (dMatch) {
          const raw = dMatch.token_balance !== undefined ? dMatch.token_balance : dMatch.tokens;
          if (raw !== null && raw !== undefined && !isNaN(Number(raw))) {
            currentBal = Number(raw);
          }
        }
      }

      // 2. Compute accurate adjustment delta & new balance
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

      // 3. Create authoritative ledger record
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

      // 4. Persist to disk
      const updatedTxs = [txRecord, ...allTxs];
      writeDiskTransactions(updatedTxs);

      const diskUsersList = readDiskUsers();
      const existingUserIdx = diskUsersList.findIndex(u => u.email && u.email.toLowerCase().trim() === customerEmail);
      if (existingUserIdx >= 0) {
        diskUsersList[existingUserIdx].token_balance = newBal;
        diskUsersList[existingUserIdx].tokens = newBal;
      } else {
        diskUsersList.unshift({
          id: 'usr_' + Date.now().toString(36),
          email: customerEmail,
          customer_name: customerEmail.split('@')[0],
          token_balance: newBal,
          tokens: newBal,
          role: 'user'
        });
      }
      writeDiskUsers(diskUsersList);

      // 5. Persist to PostgreSQL (Supabase)
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

      // 6. Persist to MySQL
      try {
        const mysqlModule = await import('@/lib/mysql').catch(() => null);
        if (mysqlModule && typeof mysqlModule.query === 'function') {
          await mysqlModule.query(
            `INSERT INTO users (id, email, token_balance, tokens, updated_at) 
             VALUES (?, ?, ?, ?, NOW()) 
             ON DUPLICATE KEY UPDATE token_balance = VALUES(token_balance), tokens = VALUES(tokens), updated_at = NOW()`,
            ['usr_' + Date.now().toString(36), customerEmail, newBal, newBal]
          );

          await mysqlModule.query(
            "UPDATE users SET token_balance = ?, tokens = ? WHERE email = ?",
            [newBal, newBal, customerEmail]
          );

          await mysqlModule.query(
            `INSERT INTO token_transactions (id, customer_email, user_email, amount, balance_after, type, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [txRecord.id, customerEmail, customerEmail, txRecord.amount, txRecord.balance_after, txRecord.type, txRecord.description]
          ).catch(() => {});
        }
      } catch (_) {}

      return NextResponse.json({
        success: true,
        message: `Successfully adjusted balance for ${customerEmail}.`,
        new_balance: newBal,
        balance_after: newBal,
        previous_balance: currentBal,
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
        await mysqlModule.query("TRUNCATE TABLE token_transactions").catch(() => {});
      }
    } catch (_) {}

    return NextResponse.json({ success: true, message: 'Ledger cleared' }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
