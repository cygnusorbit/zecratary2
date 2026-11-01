import { NextRequest, NextResponse } from 'next/server';
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
    isEnabled: true,
    costs: DEFAULT_COSTS,
    packages: DEFAULT_PACKAGES
  };
}

function readTokenTransactions(): any[] {
  try {
    const fPath = getTransactionsFilePath();
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf8');
      const parsed = JSON.parse(raw);
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

// Authoritative CORS OPTIONS handler
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

// GET /api/tokens: Load User Telemetry, Packages, and Audit Ledger
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'usr_admin_1';
    const email = searchParams.get('email') || 'admin@zecratary.com';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '10', 10));
    const searchQuery = (searchParams.get('search') || '').toLowerCase().trim();
    const typeFilter = searchParams.get('type') || 'all';

    const settings = readTokenSettings();
    const allTxs = readTokenTransactions();

    // User-specific filtering
    const userTxs = allTxs.filter((tx: any) => {
      const matchUser = !tx.user_id || tx.user_id === userId || !tx.user_email || tx.user_email.toLowerCase() === email.toLowerCase();
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

    // Default Token Balance calculation
    const tokenBalance = Math.max(0, totalGranted - totalDeducted);

    return NextResponse.json({
      success: true,
      balance: tokenBalance,
      walletBalance: 120.00,
      tokenName: settings.tokenName || 'Foodie Token',
      tokenSymbol: settings.tokenSymbol || '🪙',
      tokenIcon: settings.tokenIcon || '',
      isEnabled: settings.isEnabled ?? true,
      costs: settings.costs || DEFAULT_COSTS,
      packages: settings.packages || DEFAULT_PACKAGES,
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

// POST /api/tokens: Process atomic purchase, grant, or deduction
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'purchase';
    const userId = body.userId || 'usr_admin_1';
    const userEmail = body.userEmail || 'admin@zecratary.com';

    const allTxs = readTokenTransactions();

    if (action === 'purchase') {
      const tokens = Number(body.tokens || body.tokenAmount || 0);
      const price = Number(body.price || body.priceDollars || 0);
      const pkgName = body.packageName || 'Token Bundle';

      // Record transaction
      const newTx = {
        id: `tx_tok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: userId,
        user_email: userEmail,
        amount: tokens,
        balance_after: tokens, // Updated live
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
        tokensAdded: tokens,
        priceDeducted: price
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
