import { scopeToSession } from '@/lib/requestUser';
import { isAuthEnforced as isAuthEnforcedNow } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { applyWalletDelta } from '@/lib/transactionService';
import { addTokensToUser } from '@/lib/tokenService';

export const dynamic = 'force-dynamic';

async function safeDbExecute(sql: string, params: any[] = []) {
  try {
    return await query(sql, params);
  } catch (err: any) {
    return [];
  }
}

async function ensureBillingTables() {
  const alterStatements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'stripe'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(128) DEFAULT 'taster'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_interval VARCHAR(32) DEFAULT 'MONTH'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expiry_date TIMESTAMP NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance INT DEFAULT 25000`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10, 2) DEFAULT 0.00`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  ];

  for (const stmt of alterStatements) {
    try {
      await safeDbExecute(stmt);
    } catch (_) {
      // Fallback for MySQL engines where IF NOT EXISTS might not be supported in older versions
      try {
        const fallbackStmt = stmt.replace(' IF NOT EXISTS', '');
        await safeDbExecute(fallbackStmt);
      } catch (_) {}
    }
  }

  await safeDbExecute(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id VARCHAR(128) PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      plan_name VARCHAR(255),
      plan_slug VARCHAR(128),
      amount DECIMAL(10, 2) DEFAULT 0.00,
      currency VARCHAR(16) DEFAULT 'USD',
      gateway VARCHAR(64) DEFAULT 'stripe',
      status VARCHAR(64) DEFAULT 'succeeded',
      failure_reason TEXT,
      test_mode BOOLEAN DEFAULT TRUE,
      is_recurring BOOLEAN DEFAULT TRUE,
      recurring_interval VARCHAR(32) DEFAULT 'MONTH',
      auto_renew BOOLEAN DEFAULT TRUE,
      expiry_date TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await safeDbExecute(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(128),
      user_email VARCHAR(255),
      amount DECIMAL(10, 2) DEFAULT 0.00,
      balance_after DECIMAL(10, 2) DEFAULT 0.00,
      type VARCHAR(64) DEFAULT 'subscription_purchase',
      category VARCHAR(64) DEFAULT 'plan',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function GET(req: NextRequest) {
  await ensureBillingTables();

  try {
    const { searchParams } = new URL(req.url);
    const scopedGet = scopeToSession(req, { email: searchParams.get('email'), userId: searchParams.get('userId') });
    if (scopedGet.error) return scopedGet.error;
    const emailParam = scopedGet.email || null;
    const userIdParam = scopedGet.userId || null;

    let cleanEmail = (emailParam || '').toLowerCase().trim();

    if (!cleanEmail && !userIdParam) {
      const uRows = await safeDbExecute(`SELECT email FROM users WHERE role != 'admin' ORDER BY created_at ASC LIMIT 1`);
      if (uRows && uRows.length > 0) {
        cleanEmail = (uRows[0].email || '').toLowerCase().trim();
      } else {
        cleanEmail = 'admin@example.com';
      }
    }

    let userRows: any[] = [];
    if (userIdParam && cleanEmail) {
      userRows = await safeDbExecute(
        `SELECT id, name, email, role, subscription_plan, plan_interval, plan_expiry_date, payment_method, token_balance, wallet_balance FROM users WHERE id = $1 OR LOWER(email) = $2 LIMIT 1`,
        [userIdParam, cleanEmail]
      );
    } else if (userIdParam) {
      userRows = await safeDbExecute(
        `SELECT id, name, email, role, subscription_plan, plan_interval, plan_expiry_date, payment_method, token_balance, wallet_balance FROM users WHERE id = $1 LIMIT 1`,
        [userIdParam]
      );
    } else {
      userRows = await safeDbExecute(
        `SELECT id, name, email, role, subscription_plan, plan_interval, plan_expiry_date, payment_method, token_balance, wallet_balance FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail]
      );
    }

    const user = userRows && userRows.length > 0 ? userRows[0] : {
      id: userIdParam || 'usr_default',
      name: cleanEmail.split('@')[0] || 'User',
      email: cleanEmail,
      role: 'user',
      subscription_plan: 'taster',
      plan_interval: 'MONTH',
      payment_method: 'stripe',
      token_balance: 25000,
      wallet_balance: 0.00
    };

    const txRows = await safeDbExecute(
      `SELECT * FROM payment_transactions WHERE LOWER(customer_email) = $1 ORDER BY created_at DESC LIMIT 50`,
      [cleanEmail]
    );

    const transactions = (txRows || []).map((r: any) => ({
      id: r.id,
      customerName: r.customer_name || user.name,
      customerEmail: r.customer_email || user.email,
      planName: r.plan_name || 'Subscription Tier',
      planSlug: r.plan_slug || '',
      amount: Number(r.amount) || 0,
      currency: r.currency || 'USD',
      gateway: r.gateway || 'stripe',
      status: r.status || 'succeeded',
      isRecurring: r.is_recurring !== undefined ? Boolean(r.is_recurring) : true,
      recurringInterval: r.recurring_interval || 'MONTH',
      autoRenew: r.auto_renew !== undefined ? Boolean(r.auto_renew) : true,
      expiryDate: r.expiry_date ? new Date(r.expiry_date).toISOString() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    }));

    // Authoritative token identity from database
    let tokenIdentity = {
      tokenName: 'Tokens',
      tokenSymbol: ''
    };
    try {
      const tsRows = await safeDbExecute(`SELECT token_name, token_symbol FROM token_settings ORDER BY updated_at DESC LIMIT 1`);
      if (tsRows && tsRows.length > 0) {
        tokenIdentity.tokenName = tsRows[0].token_name || tsRows[0].tokenName || 'Tokens';
        tokenIdentity.tokenSymbol = tsRows[0].token_symbol || tsRows[0].tokenSymbol || '';
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      user,
      transactions,
      tokenIdentity
    }, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Error fetching billing data' }, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: NextRequest) {
  await ensureBillingTables();

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      return NextResponse.json({ success: false, error: 'Malformed JSON payload.' }, {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const action = body.action || 'change_plan';
    const scopedPost = scopeToSession(req, { email: body.email || body.userEmail, userId: body.userId });
    if (scopedPost.error) return scopedPost.error;
    const email = scopedPost.email;
    const userId = scopedPost.userId;

    if (!email && !userId) {
      return NextResponse.json({ success: false, error: 'Customer email or userId is required.' }, {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Auto-Renewal Actions
    if (action === 'cancel_subscription') {
      await safeDbExecute(
        `UPDATE payment_transactions SET auto_renew = FALSE, is_recurring = FALSE, status = 'canceled', updated_at = NOW() WHERE LOWER(customer_email) = $1 AND LOWER(status) IN ('succeeded', 'paid', 'active')`,
        [email]
      );
      return NextResponse.json({
        success: true,
        message: 'Subscription auto-renewal cancelled. Plan features remain active until cycle expiration.'
      }, { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'resume_subscription') {
      await safeDbExecute(
        `UPDATE payment_transactions SET auto_renew = TRUE, is_recurring = TRUE, status = 'succeeded', updated_at = NOW() WHERE LOWER(customer_email) = $1 AND LOWER(status) = 'canceled'`,
        [email]
      );
      return NextResponse.json({
        success: true,
        message: 'Auto-renewal reactivated successfully!'
      }, { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Plan Change / Upgrade Actions (Supporting Wallet, Stripe, PayPal, and Manual Wire)
    if (action === 'change_plan' || action === 'upgrade_plan' || action === 'switch_plan') {
      if (isAuthEnforcedNow() && !scopedPost.isAdmin) return NextResponse.json({ success: false, error: 'Payments are not enabled yet. Please contact the administrator.' }, { status: 403 });
      const rawPlanSlug = String(body.planSlug || 'taster').toLowerCase().trim();
      const planSlug = rawPlanSlug.replace(/[^a-z0-9-]+/g, '-');
      const planName = body.planName || 'Plan';
      const amount = Number(body.amount || 0);
      const interval = body.interval === 'YEAR' ? 'YEAR' : 'MONTH';
      const gateway = (body.gateway || body.paymentMethod || 'stripe').toLowerCase().trim();
      const currency = (body.currency || 'USD').toUpperCase();
      const tokenLimit = Number(body.tokenLimit || 0);

      // Locate or auto-provision user record
      let uRows: any[] = [];
      if (email) {
        uRows = await safeDbExecute(`SELECT id, name, email, wallet_balance, token_balance FROM users WHERE LOWER(email) = $1 LIMIT 1`, [email]);
      }
      if ((!uRows || uRows.length === 0) && userId) {
        uRows = await safeDbExecute(`SELECT id, name, email, wallet_balance, token_balance FROM users WHERE id = $1 LIMIT 1`, [userId]);
      }

      let activeUser = uRows && uRows.length > 0 ? uRows[0] : null;

      if (!activeUser) {
        // Auto-provision user if not yet in database
        const newId = userId || ('usr_' + Date.now().toString(36));
        const newName = body.userName || email.split('@')[0] || 'Member';
        await safeDbExecute(
          `INSERT INTO users (id, email, name, role, subscription_plan, plan_interval, token_balance, wallet_balance, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', 'taster', 'MONTH', 0, 0.00, NOW(), NOW())`,
          [newId, email || `${newId}@example.com`, newName]
        );
        try {
          await addTokensToUser({ userId: newId, userEmail: email || `${newId}@example.com`, amount: 25000, type: 'signup_bonus', description: 'Starter token allowance' });
        } catch {}
        activeUser = {
          id: newId,
          email: email || `${newId}@example.com`,
          name: newName,
          wallet_balance: 0.00,
          token_balance: 25000
        };
      }

      let currentBal = Number(activeUser?.wallet_balance ?? 0);
      let currentTokens = Number(activeUser?.token_balance ?? 0);
      let newBal = currentBal;
      let newTokens = currentTokens;

      // Handle Store Wallet balance deduction
      if (gateway === 'wallet' && amount > 0) {
        if (currentBal < amount) {
          return NextResponse.json({
            success: false,
            error: `Insufficient wallet balance (${currency} ${currentBal.toFixed(2)}). Plan costs ${currency} ${amount.toFixed(2)}. Please top up your wallet.`
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Atomic debit (never goes below zero), then ledger the real resulting balance
        const debit = await applyWalletDelta(activeUser.id, activeUser.email, -amount);
        if (!debit.ok || debit.insufficient) {
          return NextResponse.json({
            success: false,
            error: `Insufficient wallet balance. Plan costs ${currency} ${amount.toFixed(2)}. Please top up your wallet.`
          }, { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        newBal = Number(debit.newBalance ?? 0);

        const wtxId = 'wtx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        await safeDbExecute(
          `INSERT INTO wallet_transactions (id, user_id, user_email, amount, balance_after, type, category, description, created_at)
           VALUES ($1, $2, $3, $4, $5, 'subscription_purchase', 'plan', $6, NOW())`,
          [wtxId, activeUser.id, activeUser.email, -amount, newBal, `Purchased ${planName} via Store Wallet Balance`]
        );
      }

      // Archive / supersede previous active records
      await safeDbExecute(
        `UPDATE payment_transactions SET status = 'canceled', auto_renew = FALSE, is_recurring = FALSE, updated_at = NOW() WHERE LOWER(customer_email) = $1 AND LOWER(status) IN ('succeeded', 'paid', 'active')`,
        [activeUser.email]
      );

      // Handle Free Tier
      if (planSlug === 'taster' || planSlug === 'free' || amount === 0) {
        await safeDbExecute(`UPDATE users SET subscription_plan = 'taster', plan_interval = 'MONTH', plan_expiry_date = NULL, updated_at = NOW() WHERE id = $1`, [activeUser.id]);
        return NextResponse.json({
          success: true,
          message: 'Switched to Free Tier (Taster).',
          wallet_balance: newBal,
          token_balance: newTokens,
          plan_slug: 'taster'
        }, { headers: { 'Content-Type': 'application/json' } });
      }

      // Compute expiration timestamp
      const expDate = new Date();
      if (interval === 'YEAR') {
        expDate.setFullYear(expDate.getFullYear() + 1);
      } else {
        expDate.setMonth(expDate.getMonth() + 1);
      }

      // Insert transaction invoice
      const txId = 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      await safeDbExecute(
        `INSERT INTO payment_transactions (
          id, customer_name, customer_email, plan_name, plan_slug, amount,
          currency, gateway, status, is_recurring, recurring_interval,
          auto_renew, expiry_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'succeeded', TRUE, $9, TRUE, $10, NOW(), NOW())`,
        [txId, body.userName || activeUser.name, activeUser.email, planName, planSlug, amount, currency, gateway, interval, expDate.toISOString()]
      );

      // Grant tokens and update plan on user record
      if (tokenLimit > 0) {
        const granted = await addTokensToUser({ userId: activeUser.id, userEmail: activeUser.email, amount: tokenLimit, type: 'plan_grant', description: `${planName} plan token allowance` });
        newTokens = granted != null ? Number(granted) : currentTokens + tokenLimit;
      }

      await safeDbExecute(
        `UPDATE users SET subscription_plan = $1, plan_interval = $2, plan_expiry_date = $3, payment_method = $4, updated_at = NOW() WHERE id = $5`,
        [planSlug, interval, expDate.toISOString(), gateway, activeUser.id]
      );

      return NextResponse.json({
        success: true,
        message: `Successfully activated ${planName}!`,
        transactionId: txId,
        wallet_balance: newBal,
        token_balance: newTokens,
        plan_slug: planSlug
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return NextResponse.json({ success: false, error: `Unrecognized action: ${action}` }, {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Billing processing failed.' }, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
