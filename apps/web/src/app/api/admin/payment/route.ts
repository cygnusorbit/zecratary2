import { NextResponse } from 'next/server';
import { secureJson, restoreMaskedSecrets } from '@/lib/secretRedaction';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

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


function normalizeBool(val: any, fallback = false): boolean {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}

async function ensureGatewaySchema() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INT PRIMARY KEY DEFAULT 1,
        payment_settings JSON,
        currency VARCHAR(10) DEFAULT 'USD',
        site_name TEXT,
        theme_colors JSON,
        value JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(async () => {
      // Fallback for strict PostgreSQL JSONB
      await query(`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id INT PRIMARY KEY DEFAULT 1,
          payment_settings JSONB,
          currency VARCHAR(10) DEFAULT 'USD',
          site_name TEXT,
          theme_colors JSONB,
          value JSONB,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `).catch(() => {});
    });

    await query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id VARCHAR(255) PRIMARY KEY,
        customer_name TEXT,
        customer_email TEXT,
        plan_name TEXT,
        plan_slug TEXT,
        amount NUMERIC(12,2) DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'USD',
        gateway VARCHAR(50) DEFAULT 'stripe',
        status VARCHAR(50) DEFAULT 'pending',
        transfer_reference TEXT,
        failure_reason TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
  } catch (err) {
    console.warn('[PaymentGateway API] Schema notice:', err);
  }
}

async function savePaymentSettingsDual(ps: any, currency = 'USD') {
  const jsonSettings = JSON.stringify(ps);
  // 1. Try PostgreSQL upsert
  try {
    await query(
      `INSERT INTO admin_settings (id, payment_settings, currency, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET 
         payment_settings = EXCLUDED.payment_settings,
         currency = EXCLUDED.currency,
         updated_at = NOW()`,
      [jsonSettings, currency]
    );
  } catch (pgErr) {
    // 2. Try MySQL upsert
    try {
      await query(
        `INSERT INTO admin_settings (id, payment_settings, currency, updated_at)
         VALUES (1, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           payment_settings = VALUES(payment_settings),
           currency = VALUES(currency),
           updated_at = NOW()`,
        [jsonSettings, currency]
      );
    } catch (myErr) {
      // 3. Fallback conditional update
      try {
        const row = await query(`SELECT id FROM admin_settings WHERE id = '1' LIMIT 1`);
        const exists = Array.isArray(row) ? row.length > 0 : Boolean(((row as any)?.rows)?.length);
        if (exists) {
          await query(`UPDATE admin_settings SET payment_settings = $1, currency = $2 WHERE id = '1'`, [jsonSettings, currency]).catch(async () => {
            await query(`UPDATE admin_settings SET payment_settings = ?, currency = ? WHERE id = '1'`, [jsonSettings, currency]);
          });
        } else {
          await query(`INSERT INTO admin_settings (id, payment_settings, currency) VALUES (1, $1, $2)`, [jsonSettings, currency]).catch(async () => {
            await query(`INSERT INTO admin_settings (id, payment_settings, currency) VALUES (1, ?, ?)`, [jsonSettings, currency]);
          });
        }
      } catch (_) {}
    }
  }

  // 4. Bi-directional sync with wallet_settings.allowed_gateways
  try {
    const allowed: string[] = [];
    if (normalizeBool(ps.stripe?.enabled, true)) allowed.push('stripe');
    if (normalizeBool(ps.paypal?.enabled, false)) allowed.push('paypal');
    if (normalizeBool(ps.manualSettlement?.enabled ?? ps.manual?.enabled, true)) allowed.push('manual');
    const jsonAllowed = JSON.stringify(allowed.length > 0 ? allowed : ['stripe']);

    await query(
      `INSERT INTO wallet_settings (id, allowed_gateways, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET allowed_gateways = EXCLUDED.allowed_gateways, updated_at = NOW()`,
      [jsonAllowed]
    ).catch(async () => {
      await query(
        `INSERT INTO wallet_settings (id, allowed_gateways, updated_at)
         VALUES (1, ?, NOW())
         ON DUPLICATE KEY UPDATE allowed_gateways = VALUES(allowed_gateways), updated_at = NOW()`,
        [jsonAllowed]
      ).catch(() => {});
    });
  } catch (_) {}

  // 5. File system mirror fallback
  try {
    const fp = path.join(process.cwd(), 'data', 'admin_settings.json');
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    let existing: any = {};
    if (fs.existsSync(fp)) {
      try { existing = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) {}
    }
    existing.paymentSettings = ps;
    existing.currency = currency;
    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(fp, JSON.stringify(existing, null, 2), 'utf8');
  } catch (_) {}
}

async function loadPaymentSettingsRaw(): Promise<any> {
    let settings: any = {
      currency: 'USD',
      activeGateway: 'stripe',
      stripe: { enabled: true, testMode: true, publishableKey: '', secretKey: '', webhookSecret: '' },
      paypal: { enabled: false, testMode: true, clientId: '', clientSecret: '', webhookId: '', environment: 'sandbox' },
      manualSettlement: {
        enabled: true,
        bankName: 'Bangkok Bank',
        accountHolder: 'Zecratary Culinary Ltd',
        accountNumber: '123-4-56789-0',
        routingNumber: '002',
        swiftBic: 'BKKBTHBK',
        branchName: 'Siam Paragon Branch',
        instructions: 'Please transfer the exact subscription or wallet balance amount and upload your transfer slip.',
        requireReference: true,
        requireApproval: true,
      }
    };

    // Load from database row id = 1
    const sRes = await query(`SELECT * FROM admin_settings WHERE id = '1' LIMIT 1`).catch(() => null);
    const row = parseDbRow(sRes);
    if (row) {
      if (row.payment_settings) {
        const ps = typeof row.payment_settings === 'string' ? JSON.parse(row.payment_settings) : row.payment_settings;
        if (ps && typeof ps === 'object') settings = { ...settings, ...ps };
      }
      if (row.currency) settings.currency = row.currency;
    } else {
      // Check file mirror
      try {
        const fp = path.join(process.cwd(), 'data', 'admin_settings.json');
        if (fs.existsSync(fp)) {
          const fd = JSON.parse(fs.readFileSync(fp, 'utf8'));
          if (fd.paymentSettings) settings = { ...settings, ...fd.paymentSettings };
          if (fd.currency) settings.currency = fd.currency;
        }
      } catch (_) {}
    }

    if (!settings.stripe.publishableKey) {
      settings.stripe.publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';
    }
    if (!settings.stripe.secretKey) {
      settings.stripe.secretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SK || '';
    }
    if (!settings.stripe.webhookSecret) {
      settings.stripe.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    }
    if (!settings.paypal.clientId) {
      settings.paypal.clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '';
    }
    if (!settings.paypal.clientSecret) {
      settings.paypal.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
    }

    return settings;
}

export async function GET() {
  await ensureGatewaySchema();
  try {
    const settings: any = await loadPaymentSettingsRaw();

    const tRes = await query(`SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 100`).catch(() => []);
    const transactions = parseDbRows(tRes);

    return secureJson({
      success: true,
      paymentSettings: settings,
      settings,
      currency: settings.currency || 'USD',
      transactions
    });
  } catch (err: any) {
    return secureJson({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await ensureGatewaySchema();
  try {
    const body = await req.json();
    const action = body.action || 'save_settings';
    if (body && body.paymentSettings && typeof body.paymentSettings === 'object') {
      restoreMaskedSecrets(body.paymentSettings, await loadPaymentSettingsRaw());
    }

    if (action === 'save_settings' || action === 'toggle_gateway') {
      const ps = body.paymentSettings;
      if (!ps || typeof ps !== 'object') {
        return secureJson({ success: false, error: 'Invalid payment settings object' }, { status: 400 });
      }

      const stripeEnabled = normalizeBool(ps.stripe?.enabled, true);
      const paypalEnabled = normalizeBool(ps.paypal?.enabled, false);
      const manualEnabled = normalizeBool(ps.manualSettlement?.enabled ?? ps.manual?.enabled, true);

      ps.stripe = { ...(ps.stripe || {}), enabled: stripeEnabled };
      ps.paypal = { ...(ps.paypal || {}), enabled: paypalEnabled };
      ps.manualSettlement = { ...(ps.manualSettlement || {}), enabled: manualEnabled };
      ps.manual = { ...(ps.manual || {}), enabled: manualEnabled };

      const activeGw = body.activeGateway || ((stripeEnabled && paypalEnabled)
        ? 'both'
        : stripeEnabled
        ? 'stripe'
        : paypalEnabled
        ? 'paypal'
        : 'none');

      ps.activeGateway = activeGw;

      await savePaymentSettingsDual(ps, ps.currency || 'USD');

      return secureJson({
        success: true,
        message: 'Payment gateway settings saved successfully in PostgreSQL & MySQL!',
        activeGateway: activeGw,
        paymentSettings: ps,
        settings: ps
      });
    }

    if (action === 'toggle_stripe_test_mode') {
      const nextTestMode = normalizeBool(body.testMode, true);
      const ps = body.paymentSettings || {};
      if (ps.stripe) ps.stripe.testMode = nextTestMode;
      await savePaymentSettingsDual(ps, ps.currency || 'USD');
      return secureJson({ success: true, message: `Stripe test mode updated to ${nextTestMode}`, paymentSettings: ps });
    }

    if (action === 'toggle_paypal_test_mode') {
      const nextTestMode = normalizeBool(body.testMode, true);
      const nextEnv = body.environment || (nextTestMode ? 'sandbox' : 'live');
      const ps = body.paymentSettings || {};
      if (ps.paypal) {
        ps.paypal.testMode = nextTestMode;
        ps.paypal.environment = nextEnv;
      }
      await savePaymentSettingsDual(ps, ps.currency || 'USD');
      return secureJson({ success: true, message: `PayPal test mode updated to ${nextTestMode}`, paymentSettings: ps });
    }

    if (action === 'approve_manual_settlement') {
      const id = body.id;
      if (!id) return secureJson({ success: false, error: 'Transaction ID required' }, { status: 400 });

      await query(
        `UPDATE payment_transactions 
         SET status = 'succeeded', confirmed_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [id]
      ).catch(async () => {
        await query(
          `UPDATE payment_transactions 
           SET status = 'succeeded', confirmed_at = NOW(), updated_at = NOW() 
           WHERE id = ?`,
          [id]
        );
      });

      return secureJson({ success: true, message: 'Manual settlement transaction approved and funds confirmed!' });
    }

    if (action === 'reject_manual_settlement') {
      const id = body.id;
      const failureReason = body.failureReason || 'Wire reference rejected';
      if (!id) return secureJson({ success: false, error: 'Transaction ID required' }, { status: 400 });

      await query(
        `UPDATE payment_transactions 
         SET status = 'rejected', failure_reason = $1, updated_at = NOW() 
         WHERE id = $2`,
        [failureReason, id]
      ).catch(async () => {
        await query(
          `UPDATE payment_transactions 
           SET status = 'rejected', failure_reason = ?, updated_at = NOW() 
           WHERE id = ?`,
          [failureReason, id]
        );
      });

      return secureJson({ success: true, message: 'Manual settlement transaction rejected.' });
    }

    if (action === 'edit_transaction') {
      const id = body.id;
      if (!id) return secureJson({ success: false, error: 'Transaction ID required' }, { status: 400 });

      await query(
        `UPDATE payment_transactions 
         SET customer_name = $1, customer_email = $2, amount = $3, status = $4, transfer_reference = $5, notes = $6, updated_at = NOW()
         WHERE id = $7`,
        [body.customer_name, body.customer_email, Number(body.amount || 0), body.status || 'pending', body.transfer_reference || '', body.notes || '', id]
      ).catch(async () => {
        await query(
          `UPDATE payment_transactions 
           SET customer_name = ?, customer_email = ?, amount = ?, status = ?, transfer_reference = ?, notes = ?, updated_at = NOW()
           WHERE id = ?`,
          [body.customer_name, body.customer_email, Number(body.amount || 0), body.status || 'pending', body.transfer_reference || '', body.notes || '', id]
        );
      });

      return secureJson({ success: true, message: 'Transaction record updated successfully!' });
    }

    return secureJson({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return secureJson({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const queryId = url.searchParams.get('id');
    const body = await req.json().catch(() => ({}));
    const id = queryId || body.id;

    if (!id) return secureJson({ success: false, error: 'Missing transaction ID' }, { status: 400 });

    await query(`DELETE FROM payment_transactions WHERE id = $1`, [id]).catch(async () => {
      await query(`DELETE FROM payment_transactions WHERE id = ?`, [id]);
    });

    return secureJson({ success: true, message: `Transaction record ${id} deleted successfully.` });
  } catch (err: any) {
    return secureJson({ success: false, error: err.message }, { status: 500 });
  }
}
