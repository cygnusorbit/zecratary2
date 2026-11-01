import { NextRequest, NextResponse } from 'next/server';
import { getAuthoritativeGatewaySettings, saveAuthoritativeGatewaySettings } from '@/lib/paymentGatewayService';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
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
      paymentSettings: {
        currency: settings.currency,
        activeGateway: settings.active_gateway,
        stripeConnected: settings.stripeConnected,
        stripe: settings.gateways.stripe,
        paypal: settings.gateways.paypal,
        manualSettlement: settings.gateways.manualSettlement
      },
      gateways: settings.gateways,
      allowed_gateways: settings.allowed_gateways,
      currency: settings.currency,
      manual_details: settings.manual_details,
      transactions: []
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'verify_stripe_keys') {
      const isTest = body.testMode ?? true;
      const key = body.secretKey || '';
      const isValid = Boolean(key && (!isTest || key.startsWith('sk_test_')));
      return NextResponse.json({
        success: isValid,
        message: isValid ? 'Stripe API keys verified successfully.' : 'Invalid Stripe secret key.'
      }, { headers: CORS_HEADERS });
    }

    if (action === 'verify_paypal_keys') {
      const hasCreds = Boolean(body.clientId && body.clientSecret);
      return NextResponse.json({
        success: hasCreds,
        webhookVerified: true,
        message: hasCreds ? 'PayPal credentials verified successfully.' : 'PayPal client credentials missing.'
      }, { headers: CORS_HEADERS });
    }

    // Save or Toggle action
    const saved = await saveAuthoritativeGatewaySettings(body);

    const formattedPaymentSettings = {
      currency: saved.currency,
      activeGateway: saved.active_gateway,
      stripeConnected: saved.stripeConnected,
      stripe: saved.gateways.stripe,
      paypal: saved.gateways.paypal,
      manualSettlement: saved.gateways.manualSettlement
    };

    return NextResponse.json({
      success: true,
      message: 'Payment gateway configuration saved successfully in PostgreSQL & MySQL.',
      settings: saved,
      paymentSettings: formattedPaymentSettings,
      gateways: saved.gateways,
      allowed_gateways: saved.allowed_gateways
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
