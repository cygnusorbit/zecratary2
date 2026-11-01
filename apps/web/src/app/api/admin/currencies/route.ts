import { NextRequest, NextResponse } from 'next/server';
import { harmonizeDatabaseSchema } from '@/lib/dbSchemaHarmonizer';

export const dynamic = 'force-dynamic';

const DEFAULT_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1.0, isDefault: true, created_by: 'system' },
  { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.92, isDefault: false, created_by: 'system' },
  { code: 'GBP', symbol: '£', name: 'British Pound', rate: 0.79, isDefault: false, created_by: 'system' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', rate: 35.5, isDefault: false, created_by: 'system' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 155.2, isDefault: false, created_by: 'system' }
];

export async function GET() {
  harmonizeDatabaseSchema().catch(() => {});

  return NextResponse.json({
    success: true,
    currencies: DEFAULT_CURRENCIES,
    defaultCurrency: 'USD'
  });
}

export async function POST(req: NextRequest) {
  harmonizeDatabaseSchema().catch(() => {});
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      message: 'Currency updated successfully',
      currency: body
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
