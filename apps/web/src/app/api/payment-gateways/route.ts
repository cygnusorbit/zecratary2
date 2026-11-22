import { NextResponse } from 'next/server';
import { secureJson } from '@/lib/secretRedaction';
import { getAuthoritativeGatewaySettings } from '@/lib/paymentGatewayService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const settings = await getAuthoritativeGatewaySettings();
    return secureJson({
      success: true,
      allowed_gateways: settings.allowed_gateways,
      verified_gateways: settings.verified_gateways,
      stripeKeysVerified: settings.stripeKeysVerified,
      paypalKeysVerified: settings.paypalKeysVerified,
      settings: settings,
      gatewaySettings: settings.gateways,
      gateways: settings.gateways,
      manual_details: settings.manual_details,
      currency: settings.currency
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return secureJson({
      success: false,
      error: err.message,
      allowed_gateways: [],
      verified_gateways: []
    }, { status: 500, headers: CORS_HEADERS });
  }
}
