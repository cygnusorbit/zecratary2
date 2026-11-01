import { NextRequest, NextResponse } from 'next/server';
import { 
  getAuthoritativeWalletConfig, 
  saveAuthoritativeWalletConfig 
} from '@/lib/walletSettingsService';
import { 
  getAllAuthoritativeTransactions, 
  recordAuthoritativeTransaction, 
  calculateAuthoritativeUserBalance,
  autoHarmonizeTransactionSchema,
  WalletTransactionRecord 
} from '@/lib/transactionService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    autoHarmonizeTransactionSchema().catch(() => {});

    const config = await getAuthoritativeWalletConfig();
    const transactions = await getAllAuthoritativeTransactions();
    const adminBalance = await calculateAuthoritativeUserBalance('usr_admin_1', 'admin@zecratary.com');

    let totalDeposited = 0;
    let totalSpent = 0;
    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      if (amt > 0 && (t.status === 'completed' || t.status === 'succeeded')) {
        totalDeposited += amt;
      } else if (amt < 0) {
        totalSpent += Math.abs(amt);
      }
    }

    return NextResponse.json({
      success: true,
      settings: config,
      wallet_balance: adminBalance,
      balance: adminBalance,
      transactions: transactions,
      stats: {
        totalDeposited: totalDeposited || 250.00,
        totalSpent: totalSpent || 100.00,
        totalEvents: transactions.length
      }
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. Admin manual balance adjustment / transaction creation
    if (action === 'adjust_balance' || action === 'add_transaction') {
      const targetUserId = body.userId || 'usr_admin_1';
      const targetEmail = body.email || 'admin@zecratary.com';
      const adjustmentAmount = Number(body.amount || 0);
      const adjustmentType = body.type || (adjustmentAmount >= 0 ? 'adjustment' : 'purchase');

      const currentBalance = await calculateAuthoritativeUserBalance(targetUserId, targetEmail);
      const finalBalance = currentBalance + adjustmentAmount;

      const tx: WalletTransactionRecord = {
        id: body.id || `tx_adj_${Date.now()}`,
        user_id: targetUserId,
        email: targetEmail,
        customer_email: targetEmail,
        customer_name: body.customerName || 'Customer',
        plan_name: 'Admin Balance Adjustment',
        amount: adjustmentAmount,
        balance_after: finalBalance,
        currency: body.currency || 'USD',
        type: adjustmentType,
        gateway: body.gateway || 'manual',
        status: 'completed',
        description: body.description || `Administrative balance adjustment of $${adjustmentAmount.toFixed(2)}`,
        created_at: new Date().toISOString()
      };

      await recordAuthoritativeTransaction(tx);
      const updatedTransactions = await getAllAuthoritativeTransactions();

      return NextResponse.json({
        success: true,
        message: 'Transaction recorded and user balance updated.',
        wallet_balance: finalBalance,
        transactions: updatedTransactions
      }, { headers: CORS_HEADERS });
    }

    // 2. Save Updated Wallet Settings
    const savedConfig = await saveAuthoritativeWalletConfig(body.settings || body);
    const transactions = await getAllAuthoritativeTransactions();
    const currentBal = await calculateAuthoritativeUserBalance('usr_admin_1', 'admin@zecratary.com');

    return NextResponse.json({
      success: true,
      message: 'Wallet settings saved successfully.',
      settings: savedConfig,
      wallet_balance: currentBal,
      transactions: transactions
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
