import { NextResponse } from 'next/server';
import { getAuthoritativeGatewaySettings } from '@/lib/paymentGatewayService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      allowed_gateways: settings.allowed_gateways,
      settings: settings,
      gatewaySettings: settings.gateways,
      manual_details: settings.manual_details,
      currency: settings.currency
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      allowed_gateways: ['stripe', 'manual']
    }, { status: 500, headers: CORS_HEADERS });
  }
}
