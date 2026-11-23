import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sanitizeTokenSymbol } from '@/lib/tokenSymbol';
import { query as dbQuery } from '@/lib/db';
import { initTokenTables, saveTokenSettings as saveTokenSettingsDb, getUserTokenAccount, addTokensToUser } from '@/lib/tokenService';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';

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

function saveTransactions(txs: any[]) {
  try {
    const fPath = getTransactionsPath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(txs, null, 2), 'utf8');
  } catch (_) {}
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const settings = readTokenSettings();
    let transactions = readTransactions();
    // The AI chat, imports and purchases write their charges to the token_transactions table, not to the JSON file: read both.
    try {
      await initTokenTables();
      const res: any = await dbQuery('SELECT id, user_id, user_email, amount, balance_after, type, description, created_at FROM token_transactions ORDER BY created_at DESC LIMIT 300');
      const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
      const seen = new Set(transactions.map((t: any) => String(t.id)));
      for (const r of rows) {
        if (seen.has(String(r.id))) continue;
        transactions.push({ id: r.id, user_email: r.user_email, amount: Number(r.amount), balance_after: Number(r.balance_after), type: r.type, description: r.description, created_at: r.created_at });
      }
      transactions.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      transactions = transactions.slice(0, 300);
    } catch (_) {}

    // 1. Active database (shared settings store: local Postgres, Supabase pooler or MySQL)
    try {
      const mirror = await getJsonSetting<any>('token_settings');
      if (mirror && typeof mirror === 'object') {
        const merged = { ...settings, ...mirror };
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

    // Handle Balance Adjustment
    if (body.action === 'adjust_balance') {
      const targetEmail = (body.customer_email || body.user_email || '').trim();
      const adjustType = body.adjustment_type || 'add';
      const amount = Number(body.amount || 0);
      const symbol = body.token_symbol || '🪙';

      if (!targetEmail || !isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, error: 'Enter a customer email and an amount above zero.' }, { status: 400, headers: CORS_HEADERS });
      }
      const signed = adjustType === 'deduct' ? -amount : amount;
      const acct = await getUserTokenAccount(null, targetEmail);
      if (!acct.exists) {
        return NextResponse.json({ success: false, error: 'No account found for that email.' }, { status: 404, headers: CORS_HEADERS });
      }
      if (acct.balance + signed < 0) {
        return NextResponse.json({ success: false, error: `Cannot deduct ${amount}: the balance is only ${acct.balance}.`, balance: acct.balance }, { status: 400, headers: CORS_HEADERS });
      }
      const adjDesc = `Manual Adjustment: ${body.reason || 'Customer Support'} (${body.notes || 'Console'})`;
      // The stored balance and the ledger row move together (addTokensToUser updates the balance and writes the row).
      const newBalanceAfter = await addTokensToUser({ userEmail: targetEmail, amount: signed, type: 'adjust', description: adjDesc });
      const newTx = {
        id: `tx_adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        customer_email: targetEmail,
        user_email: targetEmail,
        amount: signed,
        balance_after: newBalanceAfter ?? acct.balance + signed,
        type: 'adjust',
        description: adjDesc,
        created_at: new Date().toISOString()
      };

      // The database ledger row is the record; no second copy is written to the JSON mirror (it would show twice).
      return NextResponse.json({
        success: true,
        message: 'Balance adjustment successfully processed',
        transaction: newTx,
        new_balance: newTx.balance_after,
        balance_after: newTx.balance_after
      }, { headers: CORS_HEADERS });
    }

    // Handle Normal Token Settings Save
    const current = readTokenSettings();
    const payload = body.tokenSettings || body.settings || body;
    const updated = {
      ...current,
      ...payload,
      updated_at: new Date().toISOString()
    };
    if (updated.tokenSymbol !== undefined) updated.tokenSymbol = sanitizeTokenSymbol(updated.tokenSymbol) || '🪙';

    saveTokenSettings(updated);

    // Persist to the active database (settings mirror + the authoritative token_settings table)
    try { await setJsonSetting('token_settings', updated, 'tokens'); } catch (_) {}
    try { await saveTokenSettingsDb(updated); } catch (_) {}

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

    try { await dbQuery('DELETE FROM token_transactions'); } catch (_) {}

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
