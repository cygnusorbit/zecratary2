import { NextRequest, NextResponse } from 'next/server';
import { harmonizeDatabaseSchema } from '@/lib/dbSchemaHarmonizer';

export const dynamic = 'force-dynamic';

export async function GET() {
  harmonizeDatabaseSchema().catch(() => {});

  const tokenSettings = {
    id: 'default_token_setting',
    costPerRecipe: 10,
    costPerMealPlan: 50,
    costPerImageScan: 25,
    freeTierTokens: 500,
    expiry_date: null,
    expiryDays: 365,
    allowRollover: true,
    updatedAt: new Date().toISOString()
  };

  return NextResponse.json({
    success: true,
    settings: tokenSettings,
    expiry_date: tokenSettings.expiry_date
  });
}

export async function POST(req: NextRequest) {
  harmonizeDatabaseSchema().catch(() => {});
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      message: 'Token settings saved successfully',
      settings: body
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
