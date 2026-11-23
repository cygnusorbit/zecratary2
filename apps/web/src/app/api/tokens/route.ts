import { scopeToSession } from '@/lib/requestUser';
import { isAuthEnforced as isAuthEnforcedNow } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveDatabase } from '@/lib/dbConfig';
import { query as dbQuery } from '@/lib/db';
import { getTokenSettings, getUserWalletAccount, purchaseTokenPackage } from '@/lib/tokenService';
import { calculateAuthoritativeUserBalance } from '@/lib/transactionService';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DEFAULT_COSTS = {
  chef: 2,
  import_url: 5,
  import_text: 2,
  import_photo: 10,
  meal_planner: 5,
  macro_analysis: 3
};

const DEFAULT_PACKAGES = [
  { id: 'pkg_starter', name: 'Starter Spark', tokens: 250, tokenAmount: 250, price: 4.99, priceDollars: 4.99, badge: 'Popular', bonusTokens: 0, popular: true, description: 'Perfect for light exploration and everyday AI recipe formulations.' },
  { id: 'pkg_chef', name: 'Culinary Master', tokens: 1000, tokenAmount: 1000, price: 14.99, priceDollars: 14.99, badge: 'Best Value', bonusTokens: 150, bestValue: true, description: 'Our most popular bundle with generous bonus tokens for daily cooking.' },
  { id: 'pkg_executive', name: 'Kitchen Enterprise', tokens: 5000, tokenAmount: 5000, price: 49.99, priceDollars: 49.99, badge: 'VIP', bonusTokens: 1000, description: 'Maximum tokens with high-priority generation throughput and OCR parsing.' }
];

function getSettingsFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_settings.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_settings.json');
}

function getTransactionsFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'token_transactions.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'token_transactions.json');
}

function getUsersFilePath(): string {
  const p1 = path.join(process.cwd(), 'apps', 'web', 'data', 'users.json');
  if (fs.existsSync(path.dirname(p1))) return p1;
  return path.join(process.cwd(), 'data', 'users.json');
}

function readTokenSettings(): any {
  try {
    const fPath = getSettingsFilePath();
    if (fs.existsSync(fPath)) {
      return JSON.parse(fs.readFileSync(fPath, 'utf8'));
    }
  } catch (_) {}
  return {
    tokenName: 'Foodie Token',
    tokenSymbol: '🪙',
    tokenIcon: '',
    isEnabled: true,
    costs: DEFAULT_COSTS,
    packages: DEFAULT_PACKAGES
  };
}

function readTokenTransactions(): any[] {
  try {
    const fPath = getTransactionsFilePath();
    if (fs.existsSync(fPath)) {
      const parsed = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveTokenTransactions(txs: any[]) {
  try {
    const fPath = getTransactionsFilePath();
    const dir = path.dirname(fPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fPath, JSON.stringify(txs, null, 2), 'utf8');
  } catch (_) {}
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scoped = scopeToSession(req, { email: searchParams.get('email') || 'admin@zecratary.com', userId: searchParams.get('userId') || 'usr_admin_1' });
    if (scoped.error) return scoped.error;
    const userId = scoped.userId;
    const email = scoped.email;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '10', 10));
    const searchQuery = (searchParams.get('search') || '').toLowerCase().trim();
    const typeFilter = searchParams.get('type') || 'all';

    const settings = readTokenSettings();
    let allTxs = readTokenTransactions();

    // The database ledger is the source of truth: its rows add up to the stored balance.
    // The JSON mirror is only a fallback when the database cannot be read, otherwise it adds entries the balance never saw.
    try {
      const dbRows: any = await dbQuery(
        'SELECT * FROM token_transactions WHERE user_id = $1 OR LOWER(user_email) = $2 ORDER BY created_at DESC',
        [String(userId || ''), String(email || '').toLowerCase()]
      );
      const rows = Array.isArray(dbRows) ? dbRows : dbRows?.rows;
      if (Array.isArray(rows)) allTxs = rows;
    } catch (_) {}

    const userTxs = allTxs.filter((tx: any) => {
      const txEmail = (tx.customer_email || tx.user_email || '').toLowerCase().trim();
      const matchUser = tx.user_id === userId || (!!txEmail && txEmail === email);
      if (!matchUser) return false;

      if (typeFilter !== 'all' && tx.type && !tx.type.toLowerCase().includes(typeFilter.toLowerCase())) {
        return false;
      }

      if (searchQuery) {
        const descMatch = (tx.description || '').toLowerCase().includes(searchQuery);
        const idMatch = (tx.id || '').toLowerCase().includes(searchQuery);
        const typeMatch = (tx.type || '').toLowerCase().includes(searchQuery);
        return descMatch || idMatch || typeMatch;
      }

      return true;
    });

    const total = userTxs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const paginatedTxs = userTxs.slice(startIndex, startIndex + limit);

    // Compute KPI Stats
    let totalDeducted = 0;
    let totalGranted = 0;
    userTxs.forEach((tx: any) => {
      const amt = Number(tx.amount || 0);
      if (amt < 0) totalDeducted += Math.abs(amt);
      else totalGranted += amt;
    });

    // Authoritative balance: Check newest transaction balance_after first
    let tokenBalance = Math.max(0, totalGranted - totalDeducted);
    if (userTxs.length > 0 && userTxs[0].balance_after !== undefined && userTxs[0].balance_after !== null && !isNaN(Number(userTxs[0].balance_after))) {
      tokenBalance = Number(userTxs[0].balance_after);
    } else {
      // Check disk users fallback
      try {
        const uPath = getUsersFilePath();
        if (fs.existsSync(uPath)) {
          const uParsed = JSON.parse(fs.readFileSync(uPath, 'utf8'));
          if (Array.isArray(uParsed)) {
            const matched = uParsed.find((u: any) => u.email && u.email.toLowerCase().trim() === email);
            if (matched && matched.token_balance !== undefined) {
              tokenBalance = Number(matched.token_balance);
            }
          }
        }
      } catch (_) {}
    }

    // One source of truth: the account row that chat charges and purchases update. The ledger-based numbers above are only a fallback for logins without an account row.
    const live: any = await getTokenSettings().catch(() => null);
    const acct = await getUserWalletAccount(userId, email);
    if (acct.exists) tokenBalance = acct.tokens;
    const walletBalance = acct.exists ? acct.wallet : await calculateAuthoritativeUserBalance(userId, email, 0).catch(() => 0);

    return NextResponse.json({
      success: true,
      balance: tokenBalance,
      walletBalance,
      tokenName: live?.tokenName || settings.tokenName || 'Foodie Token',
      tokenSymbol: live?.tokenSymbol || settings.tokenSymbol || '🪙',
      tokenIcon: live?.tokenIcon || settings.tokenIcon || '',
      isEnabled: live?.isEnabled ?? settings.isEnabled ?? true,
      // Prices shown to users are the prices really charged.
      costs: live ? {
        chef: live.chefCost, import_url: live.importUrlCost, import_text: live.importTextCost, import_photo: live.importPhotoCost,
        meal_planner: live.mealPlannerCost ?? live.chefCost, macro_analysis: live.macroAnalysisCost ?? 3
      } : (settings.costs || DEFAULT_COSTS),
      packages: (live?.packages && live.packages.length ? live.packages : settings.packages) || DEFAULT_PACKAGES,
      transactions: paginatedTxs,
      total,
      page,
      totalPages,
      stats: {
        totalDeducted,
        totalGranted,
        totalEvents: userTxs.length
      }
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'purchase';
    const scoped = scopeToSession(req, { email: body.userEmail || 'admin@zecratary.com', userId: body.userId || 'usr_admin_1' });
    if (scoped.error) return scoped.error;
    const userId = scoped.userId;
    const userEmail = scoped.email;

    const allTxs = readTokenTransactions();

    if (action === 'purchase') {
      if (isAuthEnforcedNow() && !scoped.isAdmin) return NextResponse.json({ success: false, error: 'Payments are not enabled yet. Please contact the administrator.' }, { status: 403 });
      let tokens = Number(body.tokens || body.tokenAmount || 0);
      let price = Number(body.price || body.priceDollars || 0);
      let pkgName = body.packageName || 'Token Bundle';

      // Tokens and price come from the saved package, never from the browser.
      const live: any = await getTokenSettings().catch(() => null);
      const pkg = (live?.packages || readTokenSettings().packages || DEFAULT_PACKAGES).find((p: any) => p.id === body.packageId);
      if (pkg) {
        tokens = Number(pkg.tokens ?? pkg.tokenAmount ?? 0) + Number(pkg.bonusTokens || 0);
        price = Number(pkg.price ?? pkg.priceDollars ?? 0);
        pkgName = pkg.name || pkgName;
      }

      // Real purchase: the wallet is charged, the token balance (the one chat spends from) is credited, and both are written to the ledgers.
      const real: any = await purchaseTokenPackage({ userId, userEmail, tokens, price, packageName: pkgName, paymentMethod: 'wallet' });
      if (real.success) {
        return NextResponse.json({
          success: true,
          message: real.message || 'Tokens purchased successfully',
          balance: real.newBalance,
          newBalance: real.newBalance,
          walletBalance: real.newWalletBalance,
          wallet_balance: real.newWalletBalance,
          tokensAdded: real.tokensAdded,
          priceDeducted: price,
          transactionId: real.transactionId
        });
      }
      if (real.requiresWalletTopUp) {
        return NextResponse.json({ success: false, error: real.error, requiresWalletTopUp: true, shortfall: real.shortfall, walletBalance: real.wallet_balance }, { status: 402 });
      }
      if (real.error && !/not found/i.test(real.error)) {
        return NextResponse.json({ success: false, error: real.error }, { status: 400 });
      }
      // No account row (e.g. an admin login): fall back to the ledger-only record below.

      // Find user current balance
      const userPrevTx = allTxs.find((t: any) => (t.customer_email || t.user_email || '').toLowerCase().trim() === userEmail);
      const prevBal = userPrevTx && userPrevTx.balance_after !== undefined ? Number(userPrevTx.balance_after) : 0;
      const newBal = prevBal + tokens;

      const newTx = {
        id: `tx_tok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: userId,
        user_email: userEmail,
        customer_email: userEmail,
        amount: tokens,
        balance_after: newBal,
        type: 'purchase',
        description: `Purchased ${pkgName} (+${tokens.toLocaleString()} tokens)`,
        created_at: new Date().toISOString()
      };

      allTxs.unshift(newTx);
      saveTokenTransactions(allTxs);

      return NextResponse.json({
        success: true,
        message: 'Tokens purchased successfully',
        transaction: newTx,
        balance: newBal,
        tokensAdded: tokens,
        priceDeducted: price
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
