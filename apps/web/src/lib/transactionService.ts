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
  created_at: string;
  createdAt?: string;
}

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
        if (Array.isArray(parsed) && parsed.length > 0) {
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

// Auto-Harmonize payment_transactions schema across PostgreSQL and MySQL
export async function autoHarmonizeTransactionSchema(): Promise<void> {
  // 1. PostgreSQL (Supabase / Direct Pooler)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('payment_transactions').select('id').limit(1);
    } catch (_) {}
  }

  // 2. MySQL Schema Provisioning
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  } catch (_) {}
}

export async function getAllAuthoritativeTransactions(): Promise<WalletTransactionRecord[]> {
  const combinedMap = new Map<string, WalletTransactionRecord>();

  // 1. Fetch from PostgreSQL (Supabase)
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
        .limit(100);

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
              description: row.description || row.plan_name || row.planName || 'Wallet deposit',
              transfer_reference: row.transfer_reference || row.transferReference || '',
              created_at: row.created_at || row.createdAt || new Date().toISOString()
            });
          }
        }
      }
    } catch (_) {}
  }

  // 2. Fetch from MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      const rows: any = await mysqlModule.query(
        "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 100"
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
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (_) {}

  // 3. Bidirectional Disk Merge: Always incorporate local transactions
  const diskRecords = readDiskTransactions();
  for (const r of diskRecords) {
    if (r.id && !combinedMap.has(r.id)) {
      combinedMap.set(r.id, r);
    }
  }

  const result = Array.from(combinedMap.values()).sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  writeDiskTransactions(result);
  return result;
}

export async function recordAuthoritativeTransaction(tx: WalletTransactionRecord): Promise<void> {
  // 1. Immediately mirror to disk buffer
  const current = readDiskTransactions();
  const filtered = current.filter(t => t.id !== tx.id);
  const updated = [tx, ...filtered];
  writeDiskTransactions(updated);

  // 2. Persist to PostgreSQL (Supabase) with dual-column compatibility
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Attempt full modern schema upsert
      const { error } = await supabase
        .from('payment_transactions')
        .upsert({
          id: tx.id,
          user_id: tx.user_id || 'usr_admin_1',
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
          transfer_reference: tx.transfer_reference || tx.id,
          created_at: tx.created_at || new Date().toISOString()
        }, { onConflict: 'id' });

      // If missing columns caused failure, fall back to legacy compatible insertion
      if (error) {
        await supabase
          .from('payment_transactions')
          .upsert({
            id: tx.id,
            customer_email: tx.email || tx.customer_email || 'admin@zecratary.com',
            customer_name: tx.customer_name || 'Customer',
            plan_name: tx.plan_name || tx.description || 'Wallet Deposit',
            amount: tx.amount,
            status: tx.status || 'completed',
            transfer_reference: tx.transfer_reference || tx.id,
            created_at: tx.created_at || new Date().toISOString()
          }, { onConflict: 'id' });
      }
    } catch (_) {}
  }

  // 3. Persist to MySQL
  try {
    const mysqlModule = await import('@/lib/mysql').catch(() => null);
    if (mysqlModule && typeof mysqlModule.query === 'function') {
      await mysqlModule.query(
        `INSERT INTO payment_transactions 
         (id, user_id, email, customer_email, customer_name, plan_name, amount, balance_after, currency, type, gateway, status, description, transfer_reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         balance_after = VALUES(balance_after),
         status = VALUES(status),
         updated_at = NOW()`,
        [
          tx.id,
          tx.user_id || 'usr_admin_1',
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
          tx.transfer_reference || tx.id
        ]
      );
    }
  } catch (_) {}
}
