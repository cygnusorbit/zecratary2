import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { 
  getAllAuthoritativeTransactions, 
  deleteAuthoritativeTransactions, 
  deleteAllAuthoritativeTransactions,
  recordAuthoritativeTransaction,
  autoHarmonizeTransactionSchema 
} from '@/lib/transactionService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

const DEFAULT_WALLET_CONFIG = {
  currency: 'USD',
  isEnabled: true,
  allowPurchases: true,
  minTopup: 5,
  maxTopup: 1000,
  presetAmounts: [10, 25, 50, 100, 250],
  bonusRules: [
    { threshold: 50, bonus_percent: 5 },
    { threshold: 100, bonus_percent: 10 }
  ],
  ledgerColumns: {
    customer: true,
    type: true,
    amount: true,
    balanceAfter: true,
    gateway: true,
    date: true,
    actions: true
  }
};

function getSettingsDiskPath(): string {
  const dir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
  return path.join(dir, 'wallet_settings.json');
}

function readDiskSettings(): any {
  const p = getSettingsDiskPath();
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {}
  }
  return null;
}

function writeDiskSettings(settings: any): void {
  try {
    fs.writeFileSync(getSettingsDiskPath(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch (_) {}

  const standalonePath = path.join(process.cwd(), '.next/standalone/apps/web/data/wallet_settings.json');
  if (fs.existsSync(path.dirname(standalonePath))) {
    try {
      fs.writeFileSync(standalonePath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (_) {}
  }
}

async function loadAuthoritativeUsers(): Promise<any[]> {
  const userMap = new Map<string, any>();

  // PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase.from('users').select('id, name, email, wallet_balance, balance').limit(100);
      if (Array.isArray(data)) {
        for (const u of data) {
          if (u.id || u.email) {
            userMap.set(String(u.id || u.email), {
              id: String(u.id || `usr_${u.email}`),
              name: u.name || (u.email ? u.email.split('@')[0] : 'Customer'),
              email: u.email || 'customer@zecratary.com',
              wallet_balance: Number(u.wallet_balance ?? u.balance ?? 0)
            });
          }
        }
      }
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query('SELECT id, name, email, wallet_balance, balance FROM users LIMIT 100');
      if (Array.isArray(rows)) {
        for (const u of rows) {
          const k = String(u.id || u.email);
          if (k && !userMap.has(k)) {
            userMap.set(k, {
              id: String(u.id || `usr_${u.email}`),
              name: u.name || (u.email ? u.email.split('@')[0] : 'Customer'),
              email: u.email || 'customer@zecratary.com',
              wallet_balance: Number(u.wallet_balance ?? u.balance ?? 0)
            });
          }
        }
      }
    }
  } catch (_) {}

  // Fallback Disk users
  const diskUsersPath = path.join(process.cwd(), 'apps/web/data/users.json');
  if (fs.existsSync(diskUsersPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(diskUsersPath, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const u of raw) {
          const k = String(u.id || u.email);
          if (k && !userMap.has(k)) {
            userMap.set(k, {
              id: String(u.id || `usr_${u.email}`),
              name: u.name || 'Customer',
              email: u.email || 'customer@zecratary.com',
              wallet_balance: Number(u.wallet_balance ?? 0)
            });
          }
        }
      }
    } catch (_) {}
  }

  if (userMap.size === 0) {
    userMap.set('usr_admin_1', {
      id: 'usr_admin_1',
      name: 'Administrator',
      email: 'admin@zecratary.com',
      wallet_balance: 150.00
    });
  }

  return Array.from(userMap.values());
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    autoHarmonizeTransactionSchema().catch(() => {});

    let settings = readDiskSettings();

    // Supabase PostgreSQL check
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data } = await supabase
          .from('admin_settings')
          .select('setting_value, value')
          .eq('setting_key', 'wallet_settings')
          .maybeSingle();

        if (data) {
          const parsed = JSON.parse(data.setting_value || data.value || '{}');
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            settings = { ...DEFAULT_WALLET_CONFIG, ...parsed };
          }
        }
      } catch (_) {}
    }

    // MySQL check
    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        const rows: any = await mysqlModule.query(
          "SELECT setting_value FROM admin_settings WHERE setting_key = 'wallet_settings' LIMIT 1"
        );
        if (Array.isArray(rows) && rows.length > 0 && rows[0].setting_value) {
          const parsed = JSON.parse(rows[0].setting_value);
          if (parsed && typeof parsed === 'object') {
            settings = { ...DEFAULT_WALLET_CONFIG, ...settings, ...parsed };
          }
        }
      }
    } catch (_) {}

    if (!settings) {
      settings = DEFAULT_WALLET_CONFIG;
    }

    const [transactions, users] = await Promise.all([
      getAllAuthoritativeTransactions(),
      loadAuthoritativeUsers()
    ]);

    return NextResponse.json({
      success: true,
      settings: settings,
      walletSettings: settings,
      transactions: transactions,
      users: users
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'save_settings';

    // 1. Delete transactions action (single, batch, or all)
    if (action === 'delete_transactions' || action === 'delete_transaction' || action === 'delete_all_transactions') {
      if (body.all === true || body.deleteAll === true || action === 'delete_all_transactions') {
        await deleteAllAuthoritativeTransactions();
        return NextResponse.json({
          success: true,
          message: 'All transaction records deleted successfully.',
          deletedAll: true
        }, { headers: CORS_HEADERS });
      }

      const idsToDelete: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
      if (idsToDelete.length === 0) {
        return NextResponse.json({ success: false, error: 'No transaction ID specified' }, { status: 400, headers: CORS_HEADERS });
      }
      await deleteAuthoritativeTransactions(idsToDelete);
      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${idsToDelete.length} transaction record(s).`
      }, { headers: CORS_HEADERS });
    }

    // 2. Manual balance adjustment action
    if (action === 'manual_adjustment') {
      const { email, amount, isDebit, reason } = body;
      const numAmount = parseFloat(amount);

      if (!email || isNaN(numAmount) || numAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Invalid customer email or adjustment amount.' }, { status: 400, headers: CORS_HEADERS });
      }

      let currentBal = 0;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data } = await supabase.from('users').select('wallet_balance, balance').eq('email', email).maybeSingle();
          if (data) currentBal = Number(data.wallet_balance ?? data.balance ?? 0);
        } catch (_) {}
      }

      const diff = isDebit ? -numAmount : numAmount;
      const newBal = Math.max(0, currentBal + diff);

      // Persist to PostgreSQL
      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase.from('users').upsert({ email: email, wallet_balance: newBal, balance: newBal, updated_at: new Date().toISOString() }, { onConflict: 'email' });
        } catch (_) {}
      }

      // Persist to MySQL
      try {
        const mysqlModule = await import('@/lib/mysql').catch(() => null);
        if (mysqlModule && typeof mysqlModule.query === 'function') {
          await mysqlModule.query(
            `INSERT INTO users (id, email, name, wallet_balance, balance, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE wallet_balance = VALUES(wallet_balance), balance = VALUES(balance), updated_at = NOW()`,
            [`usr_${email}`, email, email.split('@')[0], newBal, newBal]
          );
        }
      } catch (_) {}

      // Persist to disk users.json
      const diskUsersPath = path.join(process.cwd(), 'apps/web/data/users.json');
      try {
        let usersArr: any[] = [];
        if (fs.existsSync(diskUsersPath)) {
          usersArr = JSON.parse(fs.readFileSync(diskUsersPath, 'utf-8'));
        }
        const existingIdx = usersArr.findIndex((u: any) => u.email === email);
        if (existingIdx >= 0) {
          usersArr[existingIdx].wallet_balance = newBal;
          usersArr[existingIdx].balance = newBal;
        } else {
          usersArr.push({ id: `usr_${email}`, email, name: email.split('@')[0], wallet_balance: newBal, balance: newBal });
        }
        fs.writeFileSync(diskUsersPath, JSON.stringify(usersArr, null, 2), 'utf-8');
      } catch (_) {}

      // Record transaction
      const txId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await recordAuthoritativeTransaction({
        id: txId,
        user_id: 'usr_admin_1',
        email: email,
        customer_email: email,
        customer_name: email.split('@')[0],
        plan_name: 'Manual Adjustment',
        amount: diff,
        balance_after: newBal,
        currency: 'USD',
        type: 'adjustment',
        gateway: 'manual',
        status: 'completed',
        description: reason || `Admin adjustment (${isDebit ? 'debit' : 'credit'}) of $${numAmount.toFixed(2)}`,
        created_at: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        message: 'Balance adjustment applied successfully.',
        wallet_balance: newBal
      }, { headers: CORS_HEADERS });
    }

    // 3. Save Settings
    const newSettings = body.walletSettings || body.settings || DEFAULT_WALLET_CONFIG;
    writeDiskSettings(newSettings);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('admin_settings').upsert({
          setting_key: 'wallet_settings',
          setting_value: JSON.stringify(newSettings),
          value: JSON.stringify(newSettings),
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });
      } catch (_) {}
    }

    try {
      const mysqlModule = await import('@/lib/mysql').catch(() => null);
      if (mysqlModule && typeof mysqlModule.query === 'function') {
        await mysqlModule.query(
          `INSERT INTO admin_settings (setting_key, setting_value, updated_at) 
           VALUES ('wallet_settings', ?, NOW()) 
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
          [JSON.stringify(newSettings)]
        );
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Wallet configurations saved successfully.',
      walletSettings: newSettings
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let ids: string[] = [];
    let deleteAll = false;

    const { searchParams } = new URL(req.url);
    if (searchParams.get('all') === 'true' || searchParams.get('deleteAll') === 'true') {
      deleteAll = true;
    }
    const qId = searchParams.get('id');
    const qIds = searchParams.get('ids');
    if (qId) ids.push(qId);
    if (qIds) ids.push(...qIds.split(',').map(s => s.trim()));

    try {
      const body = await req.json();
      if (body?.all === true || body?.deleteAll === true) deleteAll = true;
      if (Array.isArray(body?.ids)) ids.push(...body.ids.map(String));
      else if (body?.id) ids.push(String(body.id));
    } catch (_) {}

    if (deleteAll) {
      await deleteAllAuthoritativeTransactions();
      return NextResponse.json({
        success: true,
        message: 'All transaction records deleted successfully.',
        deletedAll: true
      }, { headers: CORS_HEADERS });
    }

    ids = Array.from(new Set(ids.filter(Boolean)));
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No transaction ID specified for deletion.' }, { status: 400, headers: CORS_HEADERS });
    }

    await deleteAuthoritativeTransactions(ids);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${ids.length} transaction record(s).`,
      deletedCount: ids.length,
      deletedIds: ids
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Error deleting transactions' }, { status: 500, headers: CORS_HEADERS });
  }
}
