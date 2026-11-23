import fs from 'fs';
import { getActiveDatabase } from '@/lib/dbConfig';
import { query as pgQuery, getDatabaseDialect } from '@/lib/db';

// One active database at a time: only touch the engine the app is really using.
const usePostgres = () => getActiveDatabase() === 'postgres';
import path from 'path';

export interface WalletTransactionRecord {
  id: string;
  user_id?: string;
  userId?: string;
  email?: string;
  customer_email?: string;
  customerEmail?: string;
  customer_name?: string;
  customerName?: string;
  plan_name?: string;
  planName?: string;
  amount: number;
  balance_after?: number;
  balanceAfter?: number;
  currency?: string;
  type: string;
  gateway: string;
  status: string;
  description: string;
  transfer_reference?: string;
  transferReference?: string;
  confirmed_at?: string;
  confirmedAt?: string;
  confirmed_amount?: number;
  confirmedAmount?: number;
  failure_reason?: string;
  failureReason?: string;
  notes?: string;
  test_mode?: boolean;
  testMode?: boolean;
  created_at: string;
  createdAt?: string;
  [key: string]: any;
}

export type WalletTransactionItem = WalletTransactionRecord;

function getCandidateTxPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'apps/web/data/payment_transactions.json'),
    path.join(cwd, 'data/payment_transactions.json'),
    path.join(cwd, '.next/standalone/apps/web/data/payment_transactions.json'),
    path.join(cwd, '.next/standalone/data/payment_transactions.json'),
  ];
}

const DEFAULT_SEED_TRANSACTIONS: WalletTransactionRecord[] = [
  {
    id: 'tx_seed_init_101',
    user_id: 'usr_admin_1',
    email: 'admin@zecratary.com',
    customer_email: 'admin@zecratary.com',
    customer_name: 'Administrator',
    plan_name: 'Welcome Bonus Credit',
    amount: 150.00,
    balance_after: 150.00,
    currency: 'USD',
    type: 'topup',
    gateway: 'stripe',
    status: 'completed',
    description: 'Initial account balance allocation',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  }
];

export function readDiskTransactions(): WalletTransactionRecord[] {
  for (const p of getCandidateTxPaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_) {}
    }
  }
  return DEFAULT_SEED_TRANSACTIONS;
}

export function writeDiskTransactions(txs: WalletTransactionRecord[]): void {
  const targetDir = path.join(process.cwd(), 'apps/web/data');
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
  }
  const targetPath = path.join(targetDir, 'payment_transactions.json');
  try {
    fs.writeFileSync(targetPath, JSON.stringify(txs, null, 2), 'utf-8');
  } catch (_) {}

  const standaloneDir = path.join(process.cwd(), '.next/standalone/apps/web/data');
  if (fs.existsSync(standaloneDir)) {
    try {
      fs.writeFileSync(path.join(standaloneDir, 'payment_transactions.json'), JSON.stringify(txs, null, 2), 'utf-8');
    } catch (_) {}
  }
}

export async function autoHarmonizeTransactionSchema(): Promise<void> {
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query(`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255),
          email VARCHAR(255),
          customer_email VARCHAR(255),
          customer_name VARCHAR(255),
          plan_name VARCHAR(255),
          amount DECIMAL(10,2) DEFAULT 0.00,
          balance_after DECIMAL(10,2) DEFAULT 0.00,
          currency VARCHAR(10) DEFAULT 'USD',
          type VARCHAR(50) DEFAULT 'topup',
          gateway VARCHAR(50) DEFAULT 'stripe',
          status VARCHAR(50) DEFAULT 'completed',
          description TEXT,
          transfer_reference VARCHAR(255),
          confirmed_at DATETIME NULL,
          confirmed_amount DECIMAL(10,2) NULL,
          failure_reason TEXT NULL,
          notes TEXT NULL,
          test_mode TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      const checkCols = ['confirmed_at', 'confirmed_amount', 'failure_reason', 'notes', 'test_mode'];
      for (const col of checkCols) {
        try {
          const colInfo: any = await mysqlModule.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'payment_transactions' AND COLUMN_NAME = ?",
            [col]
          );
          if (!Array.isArray(colInfo) || colInfo.length === 0) {
            let colDef = 'TEXT NULL';
            if (col === 'confirmed_at') colDef = 'DATETIME NULL';
            else if (col === 'confirmed_amount') colDef = 'DECIMAL(10,2) NULL';
            else if (col === 'test_mode') colDef = 'TINYINT(1) DEFAULT 0';
            await mysqlModule.query(`ALTER TABLE payment_transactions ADD COLUMN ${col} ${colDef}`);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

export async function getAllAuthoritativeTransactions(): Promise<WalletTransactionRecord[]> {
  const combinedMap = new Map<string, WalletTransactionRecord>();

  // 1. PostgreSQL (the active database: local Postgres or Supabase pooler, through the shared pool)
  if (usePostgres()) {
    try {
      const data: any[] = await pgQuery('SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 300');
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.id) {
            combinedMap.set(String(row.id), {
              id: String(row.id),
              user_id: row.user_id || row.userId || 'usr_admin_1',
              email: row.email || row.customer_email || row.customerEmail || 'admin@zecratary.com',
              customer_email: row.customer_email || row.customerEmail || row.email || 'admin@zecratary.com',
              customer_name: row.customer_name || row.customerName || 'Customer',
              plan_name: row.plan_name || row.planName || 'Wallet Deposit',
              amount: Number(row.amount || 0),
              balance_after: Number(row.balance_after ?? row.balanceAfter ?? 0),
              currency: row.currency || 'USD',
              type: row.type || 'topup',
              gateway: row.gateway || 'stripe',
              status: row.status || 'completed',
              description: row.description || row.plan_name || 'Wallet deposit',
              transfer_reference: row.transfer_reference || row.transferReference || '',
              confirmed_at: row.confirmed_at || row.confirmedAt || undefined,
              confirmed_amount: row.confirmed_amount ?? row.confirmedAmount ?? undefined,
              failure_reason: row.failure_reason || row.failureReason || undefined,
              notes: row.notes || undefined,
              test_mode: row.test_mode !== undefined ? Boolean(row.test_mode) : undefined,
              created_at: row.created_at || row.createdAt || new Date().toISOString()
            });
          }
        }
      }
    } catch (_) {}
  }

  // 2. MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query(
        "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 300"
      );
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const rowId = String(row.id);
          if (rowId && !combinedMap.has(rowId)) {
            combinedMap.set(rowId, {
              id: rowId,
              user_id: row.user_id || 'usr_admin_1',
              email: row.email || row.customer_email || 'admin@zecratary.com',
              customer_email: row.customer_email || row.email || 'admin@zecratary.com',
              customer_name: row.customer_name || 'Customer',
              plan_name: row.plan_name || 'Wallet Deposit',
              amount: Number(row.amount || 0),
              balance_after: Number(row.balance_after || 0),
              currency: row.currency || 'USD',
              type: row.type || 'topup',
              gateway: row.gateway || 'stripe',
              status: row.status || 'completed',
              description: row.description || row.plan_name || 'Wallet deposit',
              transfer_reference: row.transfer_reference || '',
              confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : undefined,
              confirmed_amount: row.confirmed_amount !== null && row.confirmed_amount !== undefined ? Number(row.confirmed_amount) : undefined,
              failure_reason: row.failure_reason || undefined,
              notes: row.notes || undefined,
              test_mode: row.test_mode !== undefined ? Boolean(row.test_mode) : undefined,
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (_) {}

  // 2b. Wallet movements that other flows record in wallet_transactions (token and plan purchases paid from the
  //     wallet, Stripe webhook credits, billing). They are part of the same wallet ledger, so they are shown here too.
  try {
    const wrows: any = await pgQuery('SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 500');
    if (Array.isArray(wrows)) {
      for (const row of wrows) {
        const rowId = String(row.id || '');
        if (!rowId || combinedMap.has(rowId)) continue;
        const mail = row.user_email || row.email || '';
        combinedMap.set(rowId, {
          id: rowId,
          user_id: row.user_id || undefined,
          email: mail,
          customer_email: mail,
          customer_name: mail ? String(mail).split('@')[0] : 'Customer',
          plan_name: row.description || 'Wallet activity',
          amount: Number(row.amount || 0),
          balance_after: Number(row.balance_after || 0),
          currency: row.currency || 'USD',
          type: row.type || 'wallet',
          gateway: row.gateway || 'wallet',
          status: row.status === 'succeeded' ? 'completed' : (row.status || 'completed'),
          description: row.description || 'Wallet activity',
          transfer_reference: row.gateway_tx_id || '',
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
        });
      }
    }
  } catch (_) {}

  // 3. Fallback Disk Merge
  const diskRecords = readDiskTransactions();
  for (const r of diskRecords) {
    if (r.id && !combinedMap.has(r.id)) {
      combinedMap.set(r.id, r);
    }
  }

  return Array.from(combinedMap.values()).sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function calculateAuthoritativeUserBalance(
  arg1?: string | WalletTransactionRecord[],
  arg2?: string | number,
  arg3?: number
): Promise<number> {
  if (Array.isArray(arg1)) {
    const fallbackBal = typeof arg2 === 'number' ? arg2 : 0;
    if (arg1.length === 0) return fallbackBal;
    const sorted = [...arg1].sort((a, b) => new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime());
    const latest = sorted[0];
    if (typeof latest.balance_after === 'number') return Number(latest.balance_after);
    if (typeof latest.balanceAfter === 'number') return Number(latest.balanceAfter);
    return fallbackBal;
  }

  const userId = typeof arg1 === 'string' ? arg1 : '';
  const email = typeof arg2 === 'string' ? arg2 : '';
  const defaultBal = typeof arg3 === 'number' ? arg3 : (typeof arg2 === 'number' ? arg2 : 0);
  const normEmail = (email || '').toLowerCase().trim();

  const allTxs = await getAllAuthoritativeTransactions();
  const userTxs = allTxs.filter(t => 
    (normEmail && ((t.email && t.email.toLowerCase() === normEmail) || (t.customer_email && t.customer_email.toLowerCase() === normEmail))) ||
    (userId && (t.user_id === userId || t.userId === userId))
  );

  if (userTxs.length > 0) {
    const latest = userTxs[0];
    if (typeof latest.balance_after === 'number') {
      return Number(latest.balance_after);
    }
    if (typeof latest.balanceAfter === 'number') {
      return Number(latest.balanceAfter);
    }
  }

  // PostgreSQL (the active database)
  if (usePostgres()) {
    try {
      const rows: any[] = await pgQuery('SELECT wallet_balance, balance FROM users WHERE email = $1 OR id = $2 LIMIT 1', [normEmail, userId]);
      if (Array.isArray(rows) && rows.length > 0) {
        const val = Number(rows[0].wallet_balance ?? rows[0].balance ?? defaultBal);
        if (!isNaN(val)) return val;
      }
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query("SELECT wallet_balance, balance FROM users WHERE email = ? OR id = ? LIMIT 1", [normEmail, userId]);
      if (Array.isArray(rows) && rows.length > 0) {
        const val = Number(rows[0].wallet_balance ?? rows[0].balance ?? defaultBal);
        if (!isNaN(val)) return val;
      }
    }
  } catch (_) {}

  // Disk fallback
  const diskUsersPath = path.join(process.cwd(), 'apps/web/data/users.json');
  if (fs.existsSync(diskUsersPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(diskUsersPath, 'utf-8'));
      if (Array.isArray(raw)) {
        const found = raw.find((u: any) => (u.email && u.email.toLowerCase() === normEmail) || (userId && u.id === userId));
        if (found) {
          const val = Number(found.wallet_balance ?? found.balance ?? defaultBal);
          if (!isNaN(val)) return val;
        }
      }
    } catch (_) {}
  }

  return defaultBal;
}

export async function recordAuthoritativeTransaction(tx: WalletTransactionRecord): Promise<void> {
  const current = readDiskTransactions();
  const filtered = current.filter(t => t.id !== tx.id);
  const updated = [tx, ...filtered];
  writeDiskTransactions(updated);

  // PostgreSQL (the active database)
  if (usePostgres()) {
    try {
      await pgQuery(
        `INSERT INTO payment_transactions
         (id, user_id, email, customer_email, customer_name, plan_name, amount, balance_after, currency, type, gateway, status, description, transfer_reference, confirmed_at, confirmed_amount, failure_reason, notes, test_mode, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO UPDATE SET
           balance_after = EXCLUDED.balance_after, status = EXCLUDED.status, confirmed_at = EXCLUDED.confirmed_at,
           confirmed_amount = EXCLUDED.confirmed_amount, failure_reason = EXCLUDED.failure_reason,
           notes = EXCLUDED.notes, test_mode = EXCLUDED.test_mode`,
        [
          tx.id,
          tx.user_id || tx.userId || 'usr_admin_1',
          tx.email || tx.customer_email || 'admin@zecratary.com',
          tx.customer_email || tx.email || 'admin@zecratary.com',
          tx.customer_name || 'Customer',
          tx.plan_name || 'Wallet Deposit',
          tx.amount,
          tx.balance_after || 0,
          tx.currency || 'USD',
          tx.type || 'topup',
          tx.gateway || 'stripe',
          tx.status || 'completed',
          tx.description || 'Wallet deposit',
          tx.transfer_reference || tx.transferReference || tx.id,
          tx.confirmed_at || tx.confirmedAt || null,
          tx.confirmed_amount ?? tx.confirmedAmount ?? null,
          tx.failure_reason || tx.failureReason || null,
          tx.notes || null,
          Boolean(tx.test_mode ?? tx.testMode ?? false),
          tx.created_at || new Date().toISOString()
        ]
      );
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query(
        `INSERT INTO payment_transactions 
         (id, user_id, email, customer_email, customer_name, plan_name, amount, balance_after, currency, type, gateway, status, description, transfer_reference, confirmed_at, confirmed_amount, failure_reason, notes, test_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         balance_after = VALUES(balance_after),
         status = VALUES(status),
         confirmed_at = VALUES(confirmed_at),
         confirmed_amount = VALUES(confirmed_amount),
         failure_reason = VALUES(failure_reason),
         notes = VALUES(notes),
         test_mode = VALUES(test_mode),
         updated_at = NOW()`,
        [
          tx.id,
          tx.user_id || tx.userId || 'usr_admin_1',
          tx.email || tx.customer_email || 'admin@zecratary.com',
          tx.customer_email || tx.email || 'admin@zecratary.com',
          tx.customer_name || 'Customer',
          tx.plan_name || 'Wallet Deposit',
          tx.amount,
          tx.balance_after || 0,
          tx.currency || 'USD',
          tx.type || 'topup',
          tx.gateway || 'stripe',
          tx.status || 'completed',
          tx.description || 'Wallet deposit',
          tx.transfer_reference || tx.transferReference || tx.id,
          tx.confirmed_at || tx.confirmedAt || null,
          tx.confirmed_amount ?? tx.confirmedAmount ?? null,
          tx.failure_reason || tx.failureReason || null,
          tx.notes || null,
          tx.test_mode ? 1 : 0
        ]
      );
    }
  } catch (_) {}
}

export async function deleteAuthoritativeTransactions(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  const idSet = new Set(ids.map(String));

  // 1. Disk Mirror
  const current = readDiskTransactions();
  const updated = current.filter(t => !idSet.has(String(t.id)));
  writeDiskTransactions(updated);

  // 2. PostgreSQL (the active database)
  if (usePostgres()) {
    try {
      await pgQuery('DELETE FROM payment_transactions WHERE id = ANY($1::text[])', [Array.from(idSet)]);
    } catch (_) {}
  }

  // 3. MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      const placeholders = ids.map(() => '?').join(',');
      await mysqlModule.query(
        `DELETE FROM payment_transactions WHERE id IN (${placeholders})`,
        ids
      );
    }
  } catch (_) {}

  return true;
}

export async function deleteAllAuthoritativeTransactions(): Promise<boolean> {
  writeDiskTransactions([]);

  if (usePostgres()) {
    try {
      await pgQuery('DELETE FROM payment_transactions');
    } catch (_) {}
  }

  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (!usePostgres() && mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query("TRUNCATE TABLE payment_transactions");
    }
  } catch (_) {}

  return true;
}

export const deleteAllTransactions = deleteAllAuthoritativeTransactions;
export const getUserAuthoritativeBalance = calculateAuthoritativeUserBalance;
export const getUserBalance = calculateAuthoritativeUserBalance;
export const getWalletBalance = calculateAuthoritativeUserBalance;
export const getAuthoritativeTransactions = getAllAuthoritativeTransactions;
export const recordTransaction = recordAuthoritativeTransaction;
export const deleteTransaction = async (id: string) => deleteAuthoritativeTransactions([id]);
export const deleteTransactions = deleteAuthoritativeTransactions;
export const deleteAuthoritativeTransaction = async (id: string) => deleteAuthoritativeTransactions([id]);
export const harmonizeTransactionSchema = autoHarmonizeTransactionSchema;


export interface WalletDeltaResult {
  ok: boolean;
  exists: boolean;
  newBalance: number;
  insufficient?: boolean;
}

// Moves a wallet balance by a signed amount in ONE statement (no read-modify-write), so the stored balance and the
// ledger row written from `newBalance` can never drift apart. A debit that would go below zero is refused.
export async function applyWalletDelta(userId: string | null | undefined, email: string | null | undefined, delta: number): Promise<WalletDeltaResult> {
  const uid = String(userId || '');
  const mail = String(email || '').trim().toLowerCase();
  const d = Math.round(Number(delta) * 100) / 100;
  if (!isFinite(d)) return { ok: false, exists: false, newBalance: 0 };
  const where = '(id = $2 OR LOWER(email) = $3)';
  const guard = 'COALESCE(wallet_balance, 0) + $1 >= 0';
  try {
    if (getDatabaseDialect() === 'postgres') {
      const rows: any[] = await pgQuery(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW()
         WHERE ${where} AND ${guard} RETURNING wallet_balance`,
        [d, uid, mail]
      );
      if (Array.isArray(rows) && rows.length > 0) return { ok: true, exists: true, newBalance: Number(rows[0].wallet_balance) };
    } else {
      // MySQL has no RETURNING: check, move by the delta in one UPDATE, then read the result back.
      const before: any[] = await pgQuery('SELECT wallet_balance FROM users WHERE id = $1 OR LOWER(email) = $2 LIMIT 1', [uid, mail]);
      if (Array.isArray(before) && before.length > 0) {
        const cur = Number(before[0].wallet_balance || 0);
        if (cur + d < 0) return { ok: false, exists: true, insufficient: true, newBalance: cur };
        await pgQuery(
          `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW()
           WHERE ${where} AND ${guard}`,
          [d, uid, mail]
        );
        const after: any[] = await pgQuery('SELECT wallet_balance FROM users WHERE id = $1 OR LOWER(email) = $2 LIMIT 1', [uid, mail]);
        if (Array.isArray(after) && after.length > 0) return { ok: true, exists: true, newBalance: Number(after[0].wallet_balance) };
      }
    }
    const found: any[] = await pgQuery('SELECT wallet_balance FROM users WHERE id = $1 OR LOWER(email) = $2 LIMIT 1', [uid, mail]);
    if (Array.isArray(found) && found.length > 0) {
      return { ok: false, exists: true, insufficient: true, newBalance: Number(found[0].wallet_balance || 0) };
    }
  } catch (_) {}
  return { ok: false, exists: false, newBalance: 0 };
}
