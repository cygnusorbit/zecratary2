import { scopeToSession } from '@/lib/requestUser';
import { isAuthEnforced as isAuthEnforcedNow } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveDatabase } from '@/lib/dbConfig';

// One active database at a time: only touch the engine the app is really using.
const usePostgres = () => getActiveDatabase() === 'postgres';
import fs from 'fs';
import path from 'path';
import { 
  calculateAuthoritativeUserBalance, 
  applyWalletDelta,
  getAllAuthoritativeTransactions, 
  recordAuthoritativeTransaction, 
  autoHarmonizeTransactionSchema 
} from '@/lib/transactionService';
import { getUserWalletAccount } from '@/lib/tokenService';
import { query as appQuery } from '@/lib/db';
import { harmonizeDatabaseSchema } from '@/lib/dbSchemaHarmonizer';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

const DEFAULT_SETTINGS = {
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
  verified_gateways: ['manual'],
  allow_site_purchases: true
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'AU$', JPY: '¥', SGD: 'S$', CHF: 'Fr', NZD: 'NZ$', THB: '฿', CNY: '¥', MYR: 'RM'
};

function readDiskWalletSettings(): any {
  const candidatePaths = [
    path.join(process.cwd(), 'apps/web/data/wallet_settings.json'),
    path.join(process.cwd(), 'data/wallet_settings.json'),
    path.join(process.cwd(), '.next/standalone/apps/web/data/wallet_settings.json')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch (_) {}
    }
  }
  return DEFAULT_SETTINGS;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    harmonizeDatabaseSchema().catch(() => {});
    autoHarmonizeTransactionSchema().catch(() => {});

    const { searchParams } = new URL(req.url);
    const scoped = scopeToSession(req, { email: searchParams.get('email') || 'admin@zecratary.com', userId: searchParams.get('userId') || 'usr_admin_1' });
    if (scoped.error) return scoped.error;
    const email = scoped.email;
    const userId = scoped.userId;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '10', 10));
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const typeFilter = searchParams.get('type') || 'all';

    // 1. Authoritative User Balance Calculation
    // The account row is the one balance that token purchases also charge; the transaction ledger is only the fallback for logins without a row.
    const acctRow = await getUserWalletAccount(userId, email);
    const userBalance = acctRow.exists ? acctRow.wallet : await calculateAuthoritativeUserBalance(userId, email, 0);

    // 2. Authoritative Settings
    const diskSettings = readDiskWalletSettings();
    const currency = diskSettings.currency || 'USD';
    const currencySymbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || '$';

    // 3. Authoritative Transactions
    const allTxs = await getAllAuthoritativeTransactions();
    const userTxs = allTxs.filter((tx: any) => {
      const matchEmail = email && (
        (tx.email && tx.email.toLowerCase() === email.toLowerCase()) ||
        (tx.customer_email && tx.customer_email.toLowerCase() === email.toLowerCase()) ||
        (tx.customerEmail && tx.customerEmail.toLowerCase() === email.toLowerCase()) ||
        (tx.user_email && tx.user_email.toLowerCase() === email.toLowerCase())
      );
      const matchUser = userId && (tx.user_id === userId || tx.userId === userId);
      if (!matchEmail && !matchUser) return false;

      if (typeFilter !== 'all') {
        const tType = (tx.type || '').toLowerCase();
        if (typeFilter === 'topup' && tType !== 'topup' && tType !== 'deposit') return false;
        if (typeFilter === 'purchase' && tType !== 'purchase' && tType !== 'debit') return false;
        if (typeFilter !== 'topup' && typeFilter !== 'purchase' && tType !== typeFilter.toLowerCase()) return false;
      }

      if (search) {
        const descMatch = (tx.description || '').toLowerCase().includes(search);
        const idMatch = (tx.id || '').toLowerCase().includes(search);
        const gwMatch = (tx.gateway || '').toLowerCase().includes(search);
        const amtMatch = String(tx.amount || '').includes(search);
        return descMatch || idMatch || gwMatch || amtMatch;
      }

      return true;
    });

    const total = userTxs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const paginatedTxs = userTxs.slice(startIndex, startIndex + limit);

    // 4. Lifetime Stats
    let totalDeposited = 0;
    let totalSpent = 0;
    userTxs.forEach((tx: any) => {
      // Only money that really moved counts: pending, cancelled and failed entries are listed but not totalled.
      if (!['completed', 'succeeded', 'confirmed', 'success'].includes(String(tx.status || 'completed').toLowerCase())) return;
      const amt = Number(tx.amount || 0);
      const isDebit = amt < 0 || ['debit', 'purchase', 'withdrawal', 'fee'].includes((tx.type || '').toLowerCase());
      if (isDebit) {
        totalSpent += Math.abs(amt);
      } else {
        totalDeposited += amt;
      }
    });

    return NextResponse.json({
      success: true,
      wallet_balance: userBalance,
      balance: userBalance,
      walletBalance: userBalance,
      user: {
        id: userId,
        email: email,
        wallet_balance: userBalance,
        balance: userBalance
      },
      wallet: {
        balance: userBalance,
        wallet_balance: userBalance,
        currency: currency,
        currencySymbol: currencySymbol
      },
      currency: currency,
      currencySymbol: currencySymbol,
      walletSymbol: currencySymbol,
      settings: diskSettings,
      transactions: paginatedTxs,
      total,
      page,
      totalPages,
      stats: {
        totalDeposited: totalDeposited,
        totalSpent: totalSpent || 0,
        totalEvents: userTxs.length || 1
      }
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    harmonizeDatabaseSchema().catch(() => {});
    autoHarmonizeTransactionSchema().catch(() => {});

    const body = await req.json();
    const action = body.action || 'topup';
    const scoped = scopeToSession(req, { email: body.email || 'admin@zecratary.com', userId: body.userId || 'usr_admin_1' });
    if (scoped.error) return scoped.error;
    const userId = scoped.userId;
    const email = scoped.email;

    if (action === 'reconcile_wallet') {
      const acctRec = await getUserWalletAccount(userId, email);
      const liveBal = acctRec.exists ? acctRec.wallet : await calculateAuthoritativeUserBalance(userId, email, 0);
      const allTxs = await getAllAuthoritativeTransactions();
      const userTxs = allTxs.filter((t: any) => 
        (t.email && t.email.toLowerCase() === email.toLowerCase()) || 
        (t.customer_email && t.customer_email.toLowerCase() === email.toLowerCase()) ||
        (t.user_id === userId)
      );

      return NextResponse.json({
        success: true,
        message: 'Wallet balance reconciled successfully.',
        wallet_balance: liveBal,
        balance: liveBal,
        transactions: userTxs.slice(0, 10)
      }, { headers: CORS_HEADERS });
    }

    if (action === 'topup') {
      if (isAuthEnforcedNow() && !scoped.isAdmin) return NextResponse.json({ success: false, error: 'Payments are not enabled yet. Please contact the administrator.' }, { status: 403, headers: CORS_HEADERS });
      const amount = Number(body.amount || 0);
      const bonus = Number(body.bonus || 0);
      const totalCredited = amount + bonus;
      const gateway = body.gateway || 'stripe';
      const transferRef = body.transferReference || `ref_${Date.now()}`;

      // One atomic statement credits the wallet; the ledger row below records exactly that movement.
      const moved = await applyWalletDelta(userId, email, totalCredited);
      let newBal = moved.newBalance;
      if (!moved.exists) {
        // No account row (ledger-only customer): legacy calculation.
        newBal = (await calculateAuthoritativeUserBalance(userId, email, 0)) + totalCredited;
      }

      const newTx = {
        id: `tx_wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: userId,
        email: email,
        customer_email: email,
        customer_name: email.split('@')[0],
        plan_name: 'Wallet Deposit',
        amount: totalCredited,
        balance_after: newBal,
        currency: 'USD',
        type: 'topup',
        gateway: gateway,
        status: 'completed',
        description: `Wallet deposit via ${gateway.toUpperCase()}${bonus > 0 ? ` (+$${bonus.toFixed(2)} bonus)` : ''}`,
        transfer_reference: transferRef,
        created_at: new Date().toISOString()
      };

      await recordAuthoritativeTransaction(newTx);

      return NextResponse.json({
        success: true,
        message: `Successfully deposited $${amount.toFixed(2)} into your wallet!`,
        wallet_balance: newBal,
        balance: newBal,
        transaction: newTx
      }, { headers: CORS_HEADERS });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400, headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
