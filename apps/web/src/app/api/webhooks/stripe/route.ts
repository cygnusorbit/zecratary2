import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { applyWalletDelta } from '@/lib/transactionService';
import Stripe from 'stripe';


// Module-scoped type-safe database row extractors (unexported to prevent Next.js TS2344)
function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function parseDbRow<T = any>(res: any): T | null {
  const rows = parseDbRows<T>(res);
  return rows.length > 0 ? rows[0] : null;
}


export const dynamic = 'force-dynamic';

async function getStripeWebhookConfig() {
  try {
    const res = await query(
      `SELECT payment_settings FROM admin_settings WHERE id = 'primary_settings' LIMIT 1`
    );
    const row = Array.isArray(res) ? res[0] : (res as any)?.rows?.[0];
    let settings: any = {};
    if (row?.payment_settings) {
      settings = typeof row.payment_settings === 'string' 
        ? JSON.parse(row.payment_settings) 
        : row.payment_settings;
    }

    const secretKey = settings?.stripe?.secretKey || process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = settings?.stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';

    return { secretKey, webhookSecret, settings };
  } catch (_) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      settings: {}
    };
  }
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('stripe-signature');
    const rawBody = await req.text();
    const { secretKey, webhookSecret } = await getStripeWebhookConfig();

    let event: Stripe.Event;

    if (secretKey && webhookSecret && signature) {
      const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err: any) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
      }
    } else {
      // Fallback parse if secret is not yet configured or in development
      try {
        event = JSON.parse(rawBody) as Stripe.Event;
      } catch (_) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
    }

    const eventType = event.type;
    const dataObject: any = event.data.object;

        // 1. Checkout Session Completed
    if (eventType === 'checkout.session.completed') {
      const metadata = dataObject.metadata || {};
      const customerEmail = (metadata.userEmail || dataObject.customer_email || dataObject.customer_details?.email || '').toLowerCase().trim();
      const customerName = dataObject.customer_details?.name || 'Customer';
      const amountTotal = (dataObject.amount_total || 0) / 100;
      const currency = (dataObject.currency || 'usd').toUpperCase();
      const txId = dataObject.id;

      if (metadata.type === 'wallet_topup') {
        const userId = metadata.userId;
        const baseAmount = parseFloat(metadata.baseAmount || String(amountTotal));
        const bonusCredit = parseFloat(metadata.bonusCredit || '0');
        const totalAddition = parseFloat(metadata.totalAddition || String(baseAmount + bonusCredit));

        // Idempotent check
        const existingRes = await query(
          `SELECT id FROM wallet_transactions WHERE gateway_tx_id = $1 AND status = 'succeeded' LIMIT 1`,
          [txId]
        ).catch(() => ({ rows: [] }));
        const existingRows = Array.isArray(existingRes) ? existingRes : ((existingRes as any)?.rows || []);

        if (existingRows.length === 0) {
          const credit = await applyWalletDelta(userId ? String(userId) : null, customerEmail || null, totalAddition).catch(() => null);
          const newBal = credit && credit.ok && credit.exists ? Number(credit.newBalance ?? 0) : totalAddition;
          const finalUserId = userId || customerEmail || 'user';

          const wtxId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const desc = bonusCredit > 0
            ? `Wallet Top-Up: +$${baseAmount.toFixed(2)} (Includes +$${bonusCredit.toFixed(2)} promotional bonus)`
            : `Wallet Top-Up: +$${baseAmount.toFixed(2)}`;

          await query(`
            INSERT INTO wallet_transactions (id, user_id, user_email, type, amount, balance_after, gateway, gateway_tx_id, status, description, metadata)
            VALUES ($1, $2, $3, 'topup', $4, $5, 'stripe', $6, 'succeeded', $7, $8)
            ON CONFLICT (id) DO UPDATE SET status = 'succeeded', balance_after = EXCLUDED.balance_after
          `, [
            wtxId, finalUserId, customerEmail, totalAddition, newBal, txId, desc,
            JSON.stringify({ baseAmount, bonusCredit, totalAddition, gateway: 'stripe', stripeSessionId: txId })
          ]).catch(() => {});

          await query(`
            INSERT INTO payment_transactions (
              id, customer_name, customer_email, plan_name, plan_slug, amount,
              currency, gateway, status, is_recurring, auto_renew, gateway_transaction_id, confirmed_amount, confirmed_at, created_at, updated_at
            ) VALUES ($1, $2, $3, 'Store Wallet Top-Up', 'wallet_topup', $4, $5, 'stripe', 'succeeded', false, false, $6, $4, NOW(), NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET status = 'succeeded', confirmed_amount = EXCLUDED.amount, confirmed_at = NOW(), updated_at = NOW()
          `, [txId, customerName, customerEmail, baseAmount, currency, txId]).catch(() => {});
        }
      } else {
        if (customerEmail) {
          await query(`
            INSERT INTO payment_transactions (
              id, customer_name, customer_email, plan_name, plan_slug, amount,
              currency, gateway, status, is_recurring, auto_renew, created_at, updated_at
            ) VALUES ($1, $2, $3, 'Subscription Plan', 'nutrition-pro-monthly', $4, $5, 'stripe', 'succeeded', true, true, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
              status = 'succeeded',
              confirmed_amount = EXCLUDED.amount,
              confirmed_at = NOW(),
              updated_at = NOW()
          `, [txId, customerName, customerEmail, amountTotal, currency]).catch(() => {});
        }
      }
    }

    // 2. Invoice Payment Succeeded (Recurring Subscription Renewal)
    if (eventType === 'invoice.payment_succeeded') {
      const customerEmail = (dataObject.customer_email || '').toLowerCase().trim();
      const customerName = dataObject.customer_name || 'Customer';
      const amountPaid = (dataObject.amount_paid || 0) / 100;
      const currency = (dataObject.currency || 'usd').toUpperCase();
      const txId = dataObject.id || dataObject.payment_intent || ('inv_' + Date.now());

      const periodEnd = dataObject.lines?.data?.[0]?.period?.end;
      const expiryDate = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      if (customerEmail) {
        await query(`
          INSERT INTO payment_transactions (
            id, customer_name, customer_email, plan_name, amount,
            currency, gateway, status, is_recurring, auto_renew, expiry_date,
            confirmed_amount, confirmed_at, created_at, updated_at
          ) VALUES ($1, $2, $3, 'Subscription Renewal', $4, $5, 'stripe', 'succeeded', true, true, $6, $4, NOW(), NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            status = 'succeeded',
            expiry_date = EXCLUDED.expiry_date,
            confirmed_amount = EXCLUDED.amount,
            confirmed_at = NOW(),
            updated_at = NOW()
        `, [txId, customerName, customerEmail, amountPaid, currency, expiryDate]).catch(() => {});

        // Extend user expiration in users table
        if (expiryDate) {
          await query(`
            UPDATE users
            SET plan_expiry_date = $1, expiry_date = $1, updated_at = NOW()
            WHERE LOWER(email) = $2
          `, [expiryDate, customerEmail]).catch(() => {});
        }
      }
    }

    // 3. Customer Subscription Deleted (Cancellation)
    if (eventType === 'customer.subscription.deleted') {
      const customerId = dataObject.customer;
      // Mark active transactions as canceled and recurring off
      await query(`
        UPDATE payment_transactions
        SET status = 'canceled', is_recurring = false, auto_renew = false, updated_at = NOW()
        WHERE gateway_transaction_id = $1 OR id = $1
      `, [customerId]).catch(() => {});
    }

    // 4. Payment Intent Failed
    if (eventType === 'payment_intent.payment_failed') {
      const txId = dataObject.id;
      const failureReason = dataObject.last_payment_error?.message || 'Payment intent declined';

      await query(`
        UPDATE payment_transactions
        SET status = 'failed', failure_reason = $1, updated_at = NOW()
        WHERE id = $2 OR gateway_transaction_id = $2
      `, [failureReason, txId]).catch(() => {});
    }

    return NextResponse.json({ received: true, event: eventType });
  } catch (err: any) {
    console.error('[Stripe Webhook] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
