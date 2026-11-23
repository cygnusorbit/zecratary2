import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Balance reconciliation. A balance should equal the sum of its ledger. Older flows changed the stored balance without
// a ledger row, so this report lists every user whose ledger does not add up, and POST writes ONE clearly labelled
// "Opening balance reconciliation" row per gap (wallet: wallet_transactions, tokens: token_transactions), so the ledger
// reaches the stored balance without changing what anyone owns. Running it twice changes nothing the second time.
// Admin only. GET is a dry run; POST needs { "apply": true, "confirm": "RECONCILE" }.

const NO_STORE = { 'Cache-Control': 'no-store' };
const WALLET_OK = ['completed', 'succeeded', 'confirmed', 'success'];

const norm = (v: any) => String(v || '').trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

async function sumBy(sql: string, params: any[] = []): Promise<Array<{ k: string; uid: string; total: number }>> {
  try {
    const rows: any[] = await query(sql, params);
    return (Array.isArray(rows) ? rows : []).map((r) => ({ k: norm(r.k), uid: String(r.uid || ''), total: Number(r.total || 0) }));
  } catch (_) {
    return [];
  }
}

async function buildReport() {
  const users: any[] = await query('SELECT id, email, token_balance, wallet_balance FROM users');
  const ph = WALLET_OK.map((_, i) => `$${i + 1}`).join(',');

  const payRows = await sumBy(
    `SELECT LOWER(COALESCE(NULLIF(email, ''), NULLIF(customer_email, ''), '')) AS k, COALESCE(user_id, '') AS uid, SUM(amount) AS total
     FROM payment_transactions WHERE LOWER(COALESCE(status, 'completed')) IN (${ph}) GROUP BY 1, 2`,
    WALLET_OK
  );
  const walRows = await sumBy(
    `SELECT LOWER(COALESCE(user_email, '')) AS k, COALESCE(user_id, '') AS uid, SUM(amount) AS total
     FROM wallet_transactions WHERE LOWER(COALESCE(status, 'succeeded')) IN (${ph}) GROUP BY 1, 2`,
    WALLET_OK
  );
  const tokRows = await sumBy(
    `SELECT LOWER(COALESCE(user_email, '')) AS k, COALESCE(user_id, '') AS uid, SUM(amount) AS total
     FROM token_transactions GROUP BY 1, 2`
  );

  const walletByUser = new Map<string, number>();
  const tokensByUser = new Map<string, number>();
  const userKey = (email: string, uid: string): string | null => {
    const hit = users.find((u) => (uid && String(u.id) === uid) || (email && norm(u.email) === email));
    return hit ? String(hit.id) : null;
  };
  for (const r of [...payRows, ...walRows]) {
    const id = userKey(r.k, r.uid);
    if (id) walletByUser.set(id, (walletByUser.get(id) || 0) + r.total);
  }
  for (const r of tokRows) {
    const id = userKey(r.k, r.uid);
    if (id) tokensByUser.set(id, (tokensByUser.get(id) || 0) + r.total);
  }

  const items = users.map((u) => {
    const id = String(u.id);
    const walletStored = round2(Number(u.wallet_balance ?? 0));
    const walletLedger = round2(walletByUser.get(id) || 0);
    const tokenStored = Number(u.token_balance ?? 0);
    const tokenLedger = Number(tokensByUser.get(id) || 0);
    return {
      id,
      email: u.email,
      wallet: { stored: walletStored, ledger: walletLedger, gap: round2(walletStored - walletLedger) },
      tokens: { stored: tokenStored, ledger: tokenLedger, gap: tokenStored - tokenLedger }
    };
  });
  return items;
}

export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }

export async function GET(req: NextRequest) {
  const denied = requireAdminSession(req);
  if (denied) return denied;
  try {
    const items = await buildReport();
    const needing = items.filter((i) => Math.abs(i.wallet.gap) >= 0.01 || i.tokens.gap !== 0);
    return NextResponse.json({ success: true, dryRun: true, users: items.length, usersWithGaps: needing.length, items: needing }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Report failed.' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdminSession(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  if (body?.apply !== true || body?.confirm !== 'RECONCILE') {
    return NextResponse.json({ success: false, error: 'Send { "apply": true, "confirm": "RECONCILE" } to write the reconciliation rows. GET shows the dry run.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const items = await buildReport();
    const written: any[] = [];
    for (const it of items) {
      const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (Math.abs(it.wallet.gap) >= 0.01) {
        await query(
          `INSERT INTO wallet_transactions (id, user_id, user_email, type, amount, balance_after, gateway, status, description, metadata, created_at)
           VALUES ($1, $2, $3, 'reconciliation', $4, $5, 'system', 'succeeded', $6, $7, NOW())`,
          [`wtx_rec_${stamp}`, it.id, it.email, it.wallet.gap, it.wallet.stored,
            'Opening balance reconciliation (balance held before ledger tracking)', JSON.stringify({ reconciliation: true, ledgerBefore: it.wallet.ledger })]
        );
        written.push({ email: it.email, ledger: 'wallet', amount: it.wallet.gap });
      }
      if (it.tokens.gap !== 0) {
        await query(
          `INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
           VALUES ($1, $2, $3, $4, $5, 'reconciliation', $6, NOW())`,
          [`tx_rec_${stamp}`, it.id, it.email, it.tokens.gap, it.tokens.stored,
            'Opening balance reconciliation (balance held before ledger tracking)']
        );
        written.push({ email: it.email, ledger: 'tokens', amount: it.tokens.gap });
      }
    }
    return NextResponse.json({ success: true, applied: true, rows: written.length, written }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Reconciliation failed.' }, { status: 500, headers: NO_STORE });
  }
}
