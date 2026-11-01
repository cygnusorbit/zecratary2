import fs from 'fs';
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('payment_transactions').select('id').limit(1);
    } catch (_) {}
  }

  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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

  // 1. PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && Array.isArray(data)) {
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
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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

  // Supabase PostgreSQL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase.from('users').select('wallet_balance, balance').or(`email.eq.${normEmail},id.eq.${userId}`).maybeSingle();
      if (data) {
        const val = Number(data.wallet_balance ?? data.balance ?? defaultBal);
        if (!isNaN(val)) return val;
      }
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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

  // PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('payment_transactions')
        .upsert({
          id: tx.id,
          user_id: tx.user_id || tx.userId || 'usr_admin_1',
          email: tx.email || tx.customer_email || 'admin@zecratary.com',
          customer_email: tx.customer_email || tx.email || 'admin@zecratary.com',
          customer_name: tx.customer_name || 'Customer',
          plan_name: tx.plan_name || 'Wallet Deposit',
          amount: tx.amount,
          balance_after: tx.balance_after || 0,
          currency: tx.currency || 'USD',
          type: tx.type || 'topup',
          gateway: tx.gateway || 'stripe',
          status: tx.status || 'completed',
          description: tx.description || 'Wallet deposit',
          transfer_reference: tx.transfer_reference || tx.transferReference || tx.id,
          confirmed_at: tx.confirmed_at || tx.confirmedAt || null,
          confirmed_amount: tx.confirmed_amount ?? tx.confirmedAmount ?? null,
          failure_reason: tx.failure_reason || tx.failureReason || null,
          notes: tx.notes || null,
          test_mode: tx.test_mode ?? tx.testMode ?? false,
          created_at: tx.created_at || new Date().toISOString()
        }, { onConflict: 'id' });
    } catch (_) {}
  }

  // MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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

  // 2. PostgreSQL (Supabase)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('payment_transactions').delete().in('id', Array.from(idSet));
    } catch (_) {}
  }

  // 3. MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('payment_transactions').delete().neq('id', '___non_existent___');
    } catch (_) {}
  }

  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
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
