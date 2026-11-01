import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeGatewaySettings, saveAuthoritativeGatewaySettings } from '@/lib/paymentGatewayService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const settings = await getAuthoritativeGatewaySettings();
    return NextResponse.json({
      success: true,
      settings: settings,
      gateways: settings.gateways,
      allowed_gateways: settings.allowed_gateways,
      currency: settings.currency,
      manual_details: settings.manual_details
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const saved = await saveAuthoritativeGatewaySettings(body);
    return NextResponse.json({
      success: true,
      message: 'Payment gateway configuration saved successfully.',
      settings: saved,
      gateways: saved.gateways,
      allowed_gateways: saved.allowed_gateways
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
