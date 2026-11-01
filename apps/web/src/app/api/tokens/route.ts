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
    const userId = searchParams.get('userId') || 'usr_admin_1';
    const email = (searchParams.get('email') || 'admin@zecratary.com').toLowerCase().trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '10', 10));
    const searchQuery = (searchParams.get('search') || '').toLowerCase().trim();
    const typeFilter = searchParams.get('type') || 'all';

    const settings = readTokenSettings();
    let allTxs = readTokenTransactions();

    // Query Supabase for latest transactions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: tData } = await supabase.from('token_transactions').select('*').order('created_at', { ascending: false }).limit(250);
        if (Array.isArray(tData) && tData.length > 0) {
          const tMap = new Map();
          allTxs.forEach(t => tMap.set(t.id, t));
          tData.forEach(t => tMap.set(t.id, t));
          allTxs = Array.from(tMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      } catch (_) {}
    }

    const userTxs = allTxs.filter((tx: any) => {
      const txEmail = (tx.customer_email || tx.user_email || '').toLowerCase().trim();
      const matchUser = !tx.user_id || tx.user_id === userId || txEmail === email;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'purchase';
    const userId = body.userId || 'usr_admin_1';
    const userEmail = (body.userEmail || 'admin@zecratary.com').toLowerCase().trim();

    const allTxs = readTokenTransactions();

    if (action === 'purchase') {
      const tokens = Number(body.tokens || body.tokenAmount || 0);
      const price = Number(body.price || body.priceDollars || 0);
      const pkgName = body.packageName || 'Token Bundle';

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
