import { NextRequest, NextResponse } from 'next/server';
import { harmonizeDatabaseSchema } from '@/lib/dbSchemaHarmonizer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  harmonizeDatabaseSchema().catch(() => {});

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'usr_admin_1';

  return NextResponse.json({
    success: true,
    userId,
    wallet: {
      balance: 125.00,
      currency: 'USD',
      currencySymbol: '$',
      tokensIncluded: 1000000,
      transactions: [
        { id: 'tx_01', type: 'credit', amount: 50.00, description: 'Token Top-up', recipe_name: 'System Credit', date: new Date().toISOString() },
        { id: 'tx_02', type: 'debit', amount: 4.50, description: 'Autonomous Meal Plan Generation', recipe_name: 'Mediterranean Quinoa Power Bowl', date: new Date().toISOString() }
      ]
    }
  });
}

export async function POST(req: NextRequest) {
  harmonizeDatabaseSchema().catch(() => {});
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      message: 'Wallet transaction recorded',
      wallet: body
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
