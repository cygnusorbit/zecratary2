import { applyWalletDelta } from '@/lib/transactionService';
import { query } from '@/lib/db';
import { Pool } from 'pg';
import { sanitizeTokenSymbol } from '@/lib/tokenSymbol';

let poolInstance: Pool | null = null;
export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return poolInstance;
}

export interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  tokenAmount?: number;
  price: number;
  priceDollars?: number;
  badge?: string;
  bonusTokens?: number;
  isPopular?: boolean;
  [key: string]: any;
}

export interface TokenSettings {
  id?: string;
  tokenName: string;
  tokenSymbol: string;
  chefCost: number;
  aiChefCost?: number;
  importUrlCost: number;
  importTextCost: number;
  importPhotoCost: number;
  mealPlannerCost?: number;
  macroAnalysisCost?: number;
  startingBalance?: number;
  packages: TokenPackage[];
  planAllocations?: { [slug: string]: number };
  isEnabled: boolean;
  updatedAt?: string;
  [key: string]: any;
}

export interface DeductUserTokensParams {
  userId?: string | null;
  userEmail?: string | null;
  email?: string | null;
  cost?: number;
  amount?: number;
  feature?: string;
  type?: string;
  description?: string;
  [key: string]: any;
}

export interface DeductionResult {
  success: boolean;
  error?: string;
  deducted?: number;
  currentBalance?: number;
  newBalance?: number;
  balance?: number;
  required?: number;
  tokenSymbol?: string;
  [key: string]: any;
}

export interface PurchasePackageParams {
  userId?: string | null;
  userEmail?: string | null;
  email?: string | null;
  packageId?: string;
  package_id?: string;
  tokens?: number;
  price?: number;
  amount?: number;
  amountPaid?: number;
  currency?: string;
  gateway?: string;
  paymentMethod?: string;
  payment_method?: string;
  packageName?: string;
  package_name?: string;
  orderId?: string;
  description?: string;
  [key: string]: any;
}

export interface PurchasePackageResult {
  success: boolean;
  tokensAdded?: number;
  tokensToAdd?: number;
  tokensGranted?: number;
  newBalance?: number;
  balance?: number;
  wallet_balance?: number;
  newWalletBalance?: number | null;
  paymentMethod?: string;
  transactionId?: string;
  message?: string;
  error?: string;
  package?: TokenPackage;
  user?: any;
  requiresWalletTopUp?: boolean;
  packagePrice?: number;
  shortfall?: number;
  [key: string]: any;
}

export interface AffectedUserBalance {
  id: string;
  email: string;
  oldBalance: number;
  newBalance: number;
  adjustedTokens: number;
}

export interface DeleteTransactionsResult {
  success: boolean;
  error?: string;
  deletedCount: number;
  affectedUsers: any;
  affectedUserIds?: string[];
  [key: string]: any;
}

export type DeleteTokenTransactionsResult = DeleteTransactionsResult;

export const DEFAULT_SETTINGS: TokenSettings = {
  id: 'primary_token_settings',
  tokenName: 'Foodie Token',
  tokenSymbol: '🪙',
  chefCost: 8,
  aiChefCost: 8,
  importUrlCost: 5,
  importTextCost: 2,
  importPhotoCost: 10,
  mealPlannerCost: 5,
  macroAnalysisCost: 3,
  startingBalance: 100,
  packages: [
    { id: 'pkg_starter', name: 'Starter Pantry', tokens: 100, tokenAmount: 100, price: 4.99, priceDollars: 4.99, badge: 'Starter', isPopular: false },
    { id: 'pkg_pro', name: 'Culinary Master', tokens: 500, tokenAmount: 500, price: 19.99, priceDollars: 19.99, badge: 'Popular', isPopular: true },
    { id: 'pkg_buffet', name: 'Executive Chef', tokens: 1500, tokenAmount: 1500, price: 49.99, priceDollars: 49.99, badge: 'Best Value', isPopular: false }
  ],
  planAllocations: {
    'free': 50,
    'taster': 50,
    'pro': 500,
    'foodie-pro': 500,
    'master': 1500,
    'culinary-master': 1500
  },
  isEnabled: true
};

export const DEFAULT_TOKEN_SETTINGS = DEFAULT_SETTINGS;

function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

export async function initTokenTables(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS token_settings (
        id VARCHAR(64) PRIMARY KEY,
        token_name VARCHAR(100) DEFAULT 'Foodie Token',
        token_symbol VARCHAR(20) DEFAULT '🪙',
        chef_cost INTEGER DEFAULT 8,
        ai_chef_cost INTEGER DEFAULT 8,
        import_url_cost INTEGER DEFAULT 5,
        import_text_cost INTEGER DEFAULT 2,
        import_photo_cost INTEGER DEFAULT 10,
        meal_planner_cost INTEGER DEFAULT 5,
        macro_analysis_cost INTEGER DEFAULT 3,
        starting_balance INTEGER DEFAULT 100,
        packages JSONB DEFAULT '[]'::jsonb,
        plan_allocations JSONB DEFAULT '{}'::jsonb,
        is_enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      ALTER TABLE token_settings 
      ADD COLUMN IF NOT EXISTS plan_allocations JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS packages JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS ai_chef_cost INTEGER DEFAULT 8;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        key VARCHAR(128) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS token_transactions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        user_email VARCHAR(255),
        amount NUMERIC NOT NULL DEFAULT 0,
        balance_after NUMERIC NOT NULL DEFAULT 0,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id, user_email);
      CREATE INDEX IF NOT EXISTS idx_token_transactions_created ON token_transactions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(type);
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        user_email VARCHAR(255),
        type VARCHAR(50) DEFAULT 'token_purchase',
        amount NUMERIC NOT NULL DEFAULT 0,
        balance_after NUMERIC NOT NULL DEFAULT 0,
        gateway VARCHAR(50) DEFAULT 'wallet',
        status VARCHAR(50) DEFAULT 'succeeded',
        description TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id, user_email);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON wallet_transactions(created_at DESC);
    `);

    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS token_balance INTEGER DEFAULT 100,
      ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_token_grant_cycle VARCHAR(50),
      ADD COLUMN IF NOT EXISTS last_token_grant_date TIMESTAMPTZ;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id VARCHAR(64) PRIMARY KEY,
        slug VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        token_limit INTEGER DEFAULT 500,
        monthly_tokens INTEGER DEFAULT 500,
        is_free BOOLEAN DEFAULT false,
        monthly_price_dollars NUMERIC DEFAULT 0,
        annual_price_dollars NUMERIC DEFAULT 0,
        features JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      ALTER TABLE subscription_plans 
      ADD COLUMN IF NOT EXISTS monthly_tokens INTEGER DEFAULT 500,
      ADD COLUMN IF NOT EXISTS token_limit INTEGER DEFAULT 500;
    `);
  } catch (err) {
    console.warn('initTokenTables warning:', err);
  }
}

export async function getTokenSettings(): Promise<TokenSettings> {
  await initTokenTables();
  try {
    const rows = await query('SELECT * FROM token_settings ORDER BY updated_at DESC LIMIT 1');
    const list = parseDbRows(rows);
    if (list.length > 0) {
      const r = list[0];
      const chef = Number(r.ai_chef_cost ?? r.chef_cost ?? DEFAULT_SETTINGS.chefCost);
      return {
        id: r.id || 'primary_token_settings',
        tokenName: r.token_name || DEFAULT_SETTINGS.tokenName,
        tokenSymbol: r.token_symbol || DEFAULT_SETTINGS.tokenSymbol,
        chefCost: chef,
        aiChefCost: chef,
        importUrlCost: Number(r.import_url_cost ?? DEFAULT_SETTINGS.importUrlCost),
        importTextCost: Number(r.import_text_cost ?? DEFAULT_SETTINGS.importTextCost),
        importPhotoCost: Number(r.import_photo_cost ?? DEFAULT_SETTINGS.importPhotoCost),
        packages: Array.isArray(r.packages)
          ? r.packages
          : (typeof r.packages === 'string' ? JSON.parse(r.packages) : DEFAULT_SETTINGS.packages),
        planAllocations: r.plan_allocations
          ? (typeof r.plan_allocations === 'string' ? JSON.parse(r.plan_allocations) : r.plan_allocations)
          : (DEFAULT_SETTINGS.planAllocations || {}),
        isEnabled: Boolean(r.is_enabled ?? true),
        updatedAt: r.updated_at
      };
    }

    const fallback = await query(`SELECT value FROM admin_settings WHERE key = 'token_settings' LIMIT 1`);
    const fList = parseDbRows(fallback);
    if (fList.length > 0 && fList[0].value) {
      const parsed = typeof fList[0].value === 'string' ? JSON.parse(fList[0].value) : fList[0].value;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

export async function saveTokenSettings(settings: Partial<TokenSettings> & Record<string, any>): Promise<TokenSettings> {
  await initTokenTables();
  const current = await getTokenSettings();

  const chefCostVal = settings.aiChefCost ?? settings.chefCost ?? current.chefCost;

  const merged: TokenSettings = {
    ...current,
    ...settings,
    tokenSymbol: sanitizeTokenSymbol(settings.tokenSymbol ?? current.tokenSymbol) || '🪙',
    chefCost: chefCostVal,
    aiChefCost: chefCostVal,
    packages: Array.isArray(settings.packages) ? settings.packages : current.packages,
    planAllocations: settings.planAllocations || current.planAllocations || {},
    isEnabled: settings.isEnabled !== undefined ? Boolean(settings.isEnabled) : current.isEnabled
  };

  const idToUse = current.id || 'primary_token_settings';

  await query(`
    INSERT INTO token_settings (
      id, token_name, token_symbol, chef_cost, ai_chef_cost, import_url_cost,
      import_text_cost, import_photo_cost, packages, plan_allocations, is_enabled, updated_at
    ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, NOW())
    ON CONFLICT (id) DO UPDATE SET
      token_name = EXCLUDED.token_name,
      token_symbol = EXCLUDED.token_symbol,
      chef_cost = EXCLUDED.chef_cost,
      ai_chef_cost = EXCLUDED.ai_chef_cost,
      import_url_cost = EXCLUDED.import_url_cost,
      import_text_cost = EXCLUDED.import_text_cost,
      import_photo_cost = EXCLUDED.import_photo_cost,
      packages = EXCLUDED.packages,
      plan_allocations = EXCLUDED.plan_allocations,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = NOW()
  `, [
    idToUse,
    merged.tokenName,
    merged.tokenSymbol,
    merged.chefCost,
    merged.importUrlCost,
    merged.importTextCost,
    merged.importPhotoCost,
    JSON.stringify(merged.packages),
    JSON.stringify(merged.planAllocations),
    merged.isEnabled
  ]);

  try {
    await query(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('token_settings', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `, [JSON.stringify(merged)]);
  } catch (_) {}

  return merged;
}

export async function getUserTokenBalance(userId?: string | null, userEmail?: string | null): Promise<number> {
  await initTokenTables();
  try {
    let rows: any = [];
    if (userId) {
      rows = await query('SELECT token_balance FROM users WHERE id = $1 LIMIT 1', [userId]);
    } else if (userEmail) {
      rows = await query('SELECT token_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [userEmail.trim()]);
    }
    const list = parseDbRows(rows);
    if (list.length > 0 && list[0].token_balance !== null && list[0].token_balance !== undefined) {
      return Number(list[0].token_balance);
    }
  } catch (_) {}
  return 0;
}

// Looks the user's token account up, so callers can tell "no account" (e.g. an admin login) from "account with 0 tokens".
export async function getUserTokenAccount(userId?: string | null, userEmail?: string | null): Promise<{ exists: boolean; balance: number }> {
  await initTokenTables();
  try {
    let list: any[] = [];
    if (userId) list = parseDbRows(await query('SELECT token_balance FROM users WHERE id = $1 LIMIT 1', [userId]));
    if (list.length === 0 && userEmail) list = parseDbRows(await query('SELECT token_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [userEmail.trim()]));
    if (list.length > 0) return { exists: true, balance: Number(list[0].token_balance ?? 0) };
  } catch (_) {}
  return { exists: false, balance: 0 };
}

// Token balance and wallet balance of the signed-in user, read from the one account row that chat charges and purchases both use.
export async function getUserWalletAccount(userId?: string | null, userEmail?: string | null): Promise<{ exists: boolean; tokens: number; wallet: number }> {
  await initTokenTables();
  try {
    let list: any[] = [];
    if (userId) list = parseDbRows(await query('SELECT token_balance, wallet_balance FROM users WHERE id = $1 LIMIT 1', [userId]));
    if (list.length === 0 && userEmail) list = parseDbRows(await query('SELECT token_balance, wallet_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [userEmail.trim()]));
    if (list.length > 0) return { exists: true, tokens: Number(list[0].token_balance ?? 0), wallet: Number(list[0].wallet_balance ?? 0) };
  } catch (_) {}
  return { exists: false, tokens: 0, wallet: 0 };
}

// ----------------------------------------------------------------------------------
// deductUserTokens with Polymorphic Overloads & Explicit Scoped Variable Normalization
// ----------------------------------------------------------------------------------
export async function deductUserTokens(
  params: DeductUserTokensParams
): Promise<DeductionResult>;
export async function deductUserTokens(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  amount: number,
  type?: string,
  description?: string
): Promise<DeductionResult>;
export async function deductUserTokens(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
  arg5?: any
): Promise<DeductionResult> {
  await initTokenTables();
  const settings = await getTokenSettings();

  // Explicitly scoped local variables to satisfy TypeScript compiler (TS2304)
  let userId: string | null = null;
  let userEmail: string | null = null;
  let cost = 0;
  let feature = 'chef';
  let description = 'AI Chef Recipe Generation';

  if (typeof arg1 === 'object' && arg1 !== null) {
    userId = arg1.userId || null;
    userEmail = arg1.userEmail || arg1.email || null;
    cost = Number(arg1.cost ?? arg1.amount ?? settings.chefCost ?? 8);
    feature = arg1.feature || arg1.type || 'chef';
    description = arg1.description || 'AI Chef Recipe Generation';
  } else {
    userId = arg1 || null;
    userEmail = arg2 || null;
    cost = Number(arg3 !== undefined ? arg3 : (settings.chefCost ?? 8));
    feature = arg4 || 'chef';
    description = arg5 || 'AI Chef Recipe Generation';
  }

  if (!settings.isEnabled || cost <= 0) {
    const current = await getUserTokenBalance(userId, userEmail);
    return {
      success: true,
      deducted: 0,
      currentBalance: current,
      newBalance: current,
      balance: current,
      tokenSymbol: settings.tokenSymbol || '🪙'
    };
  }

  let userRow: any = null;
  if (userId) {
    const rows = await query('SELECT id, email, token_balance FROM users WHERE id = $1 LIMIT 1', [userId]);
    const list = parseDbRows(rows);
    if (list.length > 0) userRow = list[0];
  }
  if (!userRow && userEmail) {
    const rows = await query('SELECT id, email, token_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [userEmail.trim()]);
    const list = parseDbRows(rows);
    if (list.length > 0) userRow = list[0];
  }

  if (!userRow) {
    // No token account (for example an admin login): nothing to charge, but the use is still written to the ledger so it is visible.
    try {
      const txId0 = 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      const type0 = feature.startsWith('usage_') ? feature : `usage_${feature}`;
      await query(`
        INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [txId0, userId || userEmail || 'unknown', userEmail || userId || 'unknown', 0, 0, type0, `${description} (no token account, not charged: ${cost})`]);
    } catch (_) {}
    return { success: false, error: 'User account not found' };
  }

  const currentBalance = Number(userRow.token_balance ?? 0);
  if (currentBalance < cost) {
    return {
      success: false,
      error: `Insufficient ${settings.tokenName || 'tokens'}. Required: ${cost} ${settings.tokenSymbol || '🪙'}, Balance: ${currentBalance} ${settings.tokenSymbol || '🪙'}`,
      currentBalance,
      newBalance: currentBalance,
      balance: currentBalance,
      required: cost,
      tokenSymbol: settings.tokenSymbol || '🪙'
    };
  }

  const updateRes = await query(`
    UPDATE users 
    SET token_balance = token_balance - $1, updated_at = NOW() 
    WHERE id = $2 AND token_balance >= $1 
    RETURNING token_balance
  `, [cost, userRow.id]);

  const updatedRows = parseDbRows(updateRes);
  if (updatedRows.length === 0) {
    return {
      success: false,
      error: 'Token deduction failed due to concurrent modification.',
      currentBalance,
      newBalance: currentBalance,
      balance: currentBalance,
      required: cost,
      tokenSymbol: settings.tokenSymbol || '🪙'
    };
  }

  const newBalance = Number(updatedRows[0].token_balance);
  const txId = 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const txType = feature.startsWith('usage_') ? feature : `usage_${feature}`;

  try {
    await query(`
      INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [txId, userRow.id, userRow.email, -cost, newBalance, txType, description]);
  } catch (txErr) {
    console.error('Failed to log token transaction:', txErr);
  }

  return {
    success: true,
    deducted: cost,
    currentBalance: newBalance,
    newBalance,
    balance: newBalance,
    tokenSymbol: settings.tokenSymbol || '🪙'
  };
}

export async function addTokensToUser(
  arg1: any,
  userEmail?: string | null,
  amount?: number,
  type?: string,
  description?: string
): Promise<number | null> {
  await initTokenTables();

  let uId: string | null = null;
  let uEmail: string | null = null;
  let amt = 0;
  let txType = 'manual_credit';
  let desc = 'Tokens credited';

  if (typeof arg1 === 'object' && arg1 !== null) {
    uId = arg1.userId || null;
    uEmail = arg1.userEmail || arg1.email || null;
    amt = Number(arg1.amount || 0);
    txType = arg1.type || 'manual_credit';
    desc = arg1.description || 'Tokens credited';
  } else {
    uId = arg1 || null;
    uEmail = userEmail || null;
    amt = Number(amount || 0);
    txType = type || 'manual_credit';
    desc = description || 'Tokens credited';
  }

  let userRow: any = null;
  if (uId) {
    const rows = await query('SELECT id, email, token_balance FROM users WHERE id = $1 LIMIT 1', [uId]);
    const list = parseDbRows(rows);
    if (list.length > 0) userRow = list[0];
  }
  if (!userRow && uEmail) {
    const rows = await query('SELECT id, email, token_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [uEmail.trim()]);
    const list = parseDbRows(rows);
    if (list.length > 0) userRow = list[0];
  }

  if (!userRow) return null;

  const updateRes = await query(`
    UPDATE users 
    SET token_balance = COALESCE(token_balance, 0) + $1, updated_at = NOW() 
    WHERE id = $2 
    RETURNING token_balance
  `, [amt, userRow.id]);

  const updated = parseDbRows(updateRes);
  const newBalance = Number(updated[0]?.token_balance ?? ((userRow.token_balance || 0) + amt));
  const txId = 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  await query(`
    INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `, [txId, userRow.id, userRow.email, amt, newBalance, txType, desc]);

  return newBalance;
}

export async function purchaseTokenPackage(
  userEmailOrIdOrPayload: string | PurchasePackageParams | any,
  packageIdOrTokens?: string | number | any,
  options?: any
): Promise<PurchasePackageResult> {
  await initTokenTables();

  let userIdentifier = '';
  let pkgId = '';
  let explicitTokens = 0;
  let orderId = '';
  let paymentMethod = 'wallet';
  let customPrice = 0;
  let desc = '';
  let customPkgName = '';

  if (typeof userEmailOrIdOrPayload === 'object' && userEmailOrIdOrPayload !== null) {
    userIdentifier = String(userEmailOrIdOrPayload.userId || userEmailOrIdOrPayload.userEmail || userEmailOrIdOrPayload.email || '').trim();
    pkgId = String(userEmailOrIdOrPayload.packageId || userEmailOrIdOrPayload.package_id || '').trim();
    explicitTokens = Number(userEmailOrIdOrPayload.tokens || 0);
    orderId = String(userEmailOrIdOrPayload.orderId || '');
    paymentMethod = String(userEmailOrIdOrPayload.paymentMethod || userEmailOrIdOrPayload.payment_method || 'wallet');
    desc = String(userEmailOrIdOrPayload.description || '');
    customPrice = Number(userEmailOrIdOrPayload.price || userEmailOrIdOrPayload.amount || userEmailOrIdOrPayload.amountPaid || 0);
    customPkgName = String(userEmailOrIdOrPayload.packageName || userEmailOrIdOrPayload.package_name || '');
  } else {
    userIdentifier = String(userEmailOrIdOrPayload || '').trim();
    if (typeof packageIdOrTokens === 'number') {
      explicitTokens = packageIdOrTokens;
    } else if (typeof packageIdOrTokens === 'string') {
      pkgId = packageIdOrTokens.trim();
      const num = Number(packageIdOrTokens);
      if (!isNaN(num) && num > 0) explicitTokens = num;
    }
    if (options && typeof options === 'object') {
      orderId = String(options.orderId || '');
      paymentMethod = String(options.paymentMethod || options.payment_method || 'wallet');
      desc = String(options.description || '');
      customPrice = Number(options.price || options.amount || options.amountPaid || 0);
      customPkgName = String(options.packageName || options.package_name || '');
    }
  }

  if (!userIdentifier) {
    return { success: false, tokensAdded: 0, newBalance: 0, error: 'User identifier is required.' };
  }

  let uList: any[] = parseDbRows(await query('SELECT id, email, token_balance, wallet_balance FROM users WHERE id = $1 LIMIT 1', [userIdentifier]));
  if (uList.length === 0 && userIdentifier.includes('@')) {
    uList = parseDbRows(await query('SELECT id, email, token_balance, wallet_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [userIdentifier]));
  }
  if (uList.length === 0) {
    return { success: false, tokensAdded: 0, newBalance: 0, error: 'User account not found.' };
  }

  const user = uList[0];
  const settings = await getTokenSettings();

  let tokensToAdd = explicitTokens;
  let packageName = customPkgName || 'Token Package';
  let packagePrice = customPrice;

  if (pkgId && Array.isArray(settings.packages)) {
    const matched = settings.packages.find((p: any) => p.id === pkgId || p.name?.toLowerCase() === pkgId.toLowerCase());
    if (matched) {
      tokensToAdd = Number(matched.tokens || matched.tokenAmount || tokensToAdd);
      packageName = matched.name || packageName;
      if (packagePrice <= 0) packagePrice = Number(matched.price || matched.priceDollars || 0);
    }
  }

  if (tokensToAdd <= 0) {
    tokensToAdd = 100;
    packagePrice = packagePrice || 4.99;
  }

  let updatedWalletBalance = parseFloat(user.wallet_balance || 0);
  if (paymentMethod === 'wallet' && packagePrice > 0) {
    if (updatedWalletBalance < packagePrice) {
      return {
        success: false,
        tokensAdded: 0,
        tokensToAdd: 0,
        newBalance: Number(user.token_balance || 0),
        requiresWalletTopUp: true,
        packagePrice,
        shortfall: packagePrice - updatedWalletBalance,
        wallet_balance: updatedWalletBalance,
        newWalletBalance: updatedWalletBalance,
        error: `Insufficient wallet balance ($${updatedWalletBalance.toFixed(2)} available). This bundle requires $${packagePrice.toFixed(2)}. Please top up your wallet first.`
      };
    }

    // One atomic statement debits the wallet (refused if it would go below zero); the ledger rows record exactly that movement.
    const debit = await applyWalletDelta(user.id, user.email, -packagePrice);
    if (!debit.ok) {
      return {
        success: false,
        tokensAdded: 0,
        tokensToAdd: 0,
        newBalance: Number(user.token_balance || 0),
        requiresWalletTopUp: true,
        packagePrice,
        shortfall: Math.max(0, packagePrice - debit.newBalance),
        wallet_balance: debit.newBalance,
        newWalletBalance: debit.newBalance,
        error: `Insufficient wallet balance ($${debit.newBalance.toFixed(2)} available). This bundle requires $${packagePrice.toFixed(2)}. Please top up your wallet first.`
      };
    }
    updatedWalletBalance = debit.newBalance;

    const wtxId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`
      INSERT INTO wallet_transactions (id, user_id, user_email, type, amount, balance_after, gateway, status, description, metadata, created_at)
      VALUES ($1, $2, $3, 'token_purchase', $4, $5, 'wallet', 'succeeded', $6, $7, NOW())
    `, [
      wtxId,
      user.id,
      user.email,
      -packagePrice,
      updatedWalletBalance,
      `Purchased ${packageName} (+${tokensToAdd.toLocaleString()} ${settings.tokenSymbol || '🪙'})`,
      JSON.stringify({ packageId: pkgId || 'bundle', tokens: tokensToAdd, price: packagePrice })
    ]);
  }

  const updateRes = await query(`
    UPDATE users 
    SET token_balance = COALESCE(token_balance, 0) + $1, updated_at = NOW() 
    WHERE id = $2 
    RETURNING token_balance
  `, [tokensToAdd, user.id]);

  const updatedToken = parseDbRows(updateRes);
  const newBalance = Number(updatedToken[0]?.token_balance ?? (Number(user.token_balance || 0) + tokensToAdd));

  const txId = 'tx_pkg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const txDesc = desc || `Purchased Package: ${packageName} (+${tokensToAdd.toLocaleString()} ${settings.tokenSymbol || '🪙'})${orderId ? ` [Order: ${orderId}]` : ''}`;

  await query(`
    INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
    VALUES ($1, $2, $3, $4, $5, 'package_purchase', $6, NOW())
  `, [txId, user.id, user.email, tokensToAdd, newBalance, txDesc]);

  return {
    success: true,
    tokensAdded: tokensToAdd,
    tokensToAdd: tokensToAdd,
    tokensGranted: tokensToAdd,
    newBalance,
    balance: newBalance,
    wallet_balance: updatedWalletBalance,
    newWalletBalance: updatedWalletBalance,
    paymentMethod,
    transactionId: txId,
    message: `Successfully purchased ${packageName}! Credited +${tokensToAdd.toLocaleString()} ${settings.tokenSymbol || '🪙'}.`,
    user: {
      id: user.id,
      email: user.email,
      tokenBalance: newBalance,
      walletBalance: updatedWalletBalance
    }
  };
}

export async function grantMonthlyPlanTokenReward(
  userEmailOrId?: string | { id?: string; email?: string; userId?: string; userEmail?: string } | null,
  tokensOrOptions?: number | string | { tokenLimit?: number; tokens?: number; planSlug?: string; planName?: string; customTokens?: number; force?: boolean; [key: string]: any } | any,
  options?: { planSlug?: string; planName?: string; force?: boolean; customTokens?: number; orderId?: string; [key: string]: any } | any
): Promise<{
  success: boolean;
  tokensGranted: number;
  newBalance: number;
  reason?: string;
  cycle?: string;
  plan?: string;
  isPaid?: boolean;
  error?: string;
  [key: string]: any;
}> {
  await initTokenTables();

  let cleanIdent = '';
  let emailIdent = '';

  if (typeof userEmailOrId === 'string') {
    cleanIdent = userEmailOrId.trim();
    if (cleanIdent.includes('@')) emailIdent = cleanIdent.toLowerCase();
  } else if (userEmailOrId && typeof userEmailOrId === 'object') {
    cleanIdent = (userEmailOrId.id || userEmailOrId.userId || userEmailOrId.email || '').trim();
    if (userEmailOrId.email || userEmailOrId.userEmail) {
      emailIdent = (userEmailOrId.email || userEmailOrId.userEmail || '').trim().toLowerCase();
    }
  }

  if (!cleanIdent && !emailIdent) {
    return { success: false, tokensGranted: 0, newBalance: 0, reason: 'User identifier required' };
  }

  let opt: any = options || {};
  let explicitAmount = 0;

  if (typeof tokensOrOptions === 'number') {
    explicitAmount = tokensOrOptions;
  } else if (typeof tokensOrOptions === 'string') {
    const p = parseInt(tokensOrOptions, 10);
    if (!isNaN(p)) explicitAmount = p;
  } else if (tokensOrOptions && typeof tokensOrOptions === 'object') {
    explicitAmount = Number(tokensOrOptions.customTokens ?? tokensOrOptions.tokenLimit ?? tokensOrOptions.tokens ?? 0);
    opt = { ...tokensOrOptions, ...opt };
  }

  const userRows = await query(`
    SELECT id, email, token_balance, subscription_plan, plan_slug, plan_name, last_token_grant_cycle 
    FROM users 
    WHERE (id::text = $1 AND $1 != '') 
       OR (LOWER(TRIM(email)) = LOWER(TRIM($2)) AND $2 != '')
       OR (LOWER(TRIM(email)) = LOWER(TRIM($1)) AND $1 != '')
    LIMIT 1
  `, [cleanIdent, emailIdent]);

  const uList = parseDbRows(userRows);
  if (uList.length === 0) {
    return { success: false, tokensGranted: 0, newBalance: 0, reason: 'User not found in database' };
  }

  const user = uList[0];
  const now = new Date();
  const currentCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (user.last_token_grant_cycle === currentCycle && !opt?.force) {
    return {
      success: false,
      tokensGranted: 0,
      newBalance: Number(user.token_balance || 0),
      reason: `Monthly tokens already credited for cycle ${currentCycle}`,
      cycle: currentCycle,
      isPaid: true
    };
  }

  const planSlug = String(opt?.planSlug || user.plan_slug || user.subscription_plan || 'free').toLowerCase().trim();
  const baseSlug = planSlug.replace(/-(monthly|annual|free)$/i, '');

  let tokensToGrant = explicitAmount;
  if (tokensToGrant <= 0) {
    const planRows = await query(`
      SELECT name, slug, token_limit, monthly_tokens 
      FROM subscription_plans 
      WHERE LOWER(slug) = LOWER($1) OR LOWER(id) = LOWER($1) OR LOWER(slug) = LOWER($2)
      LIMIT 1
    `, [planSlug, baseSlug]);
    const pList = parseDbRows(planRows);
    if (pList.length > 0) {
      tokensToGrant = Number(pList[0].token_limit ?? pList[0].monthly_tokens ?? 500);
    } else {
      const settings = await getTokenSettings();
      const alloc = settings.planAllocations || {};
      tokensToGrant = Number(alloc[planSlug] ?? alloc[baseSlug] ?? (planSlug.includes('pro') ? 500 : 50));
    }
  }

  if (tokensToGrant <= 0) tokensToGrant = 500;

  const updateRes = await query(`
    UPDATE users 
    SET token_balance = COALESCE(token_balance, 0) + $1,
        last_token_grant_cycle = $2,
        last_token_grant_date = NOW(),
        updated_at = NOW()
    WHERE id = $3
    RETURNING token_balance
  `, [tokensToGrant, currentCycle, user.id]);

  const updated = parseDbRows(updateRes);
  const newBalance = Number(updated[0]?.token_balance ?? (Number(user.token_balance || 0) + tokensToGrant));

  const planDesc = opt?.planName || user.plan_name || planSlug;
  const txId = 'tx_grant_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  await query(`
    INSERT INTO token_transactions (id, user_id, user_email, amount, balance_after, type, description, created_at)
    VALUES ($1, $2, $3, $4, $5, 'plan_monthly_grant', $6, NOW())
  `, [txId, user.id, user.email, tokensToGrant, newBalance, `Monthly plan grant: ${planDesc} (+${tokensToGrant.toLocaleString()})`]);

  return {
    success: true,
    tokensGranted: tokensToGrant,
    newBalance,
    cycle: currentCycle,
    plan: planSlug,
    isPaid: true
  };
}

export async function syncUserMonthlyTokens(userId?: string | null, email?: string | null): Promise<any> {
  const ident = email || userId;
  if (!ident) return { success: false, reason: 'No identifier provided' };
  return grantMonthlyPlanTokenReward(ident);
}

export async function grantPlanTokensOnPurchase(
  userEmailOrId: string,
  planSlug: string,
  options?: { customTokens?: number; orderId?: string; isAnnual?: boolean; planName?: string; [key: string]: any }
): Promise<{ success: boolean; tokensGranted: number; newBalance: number; error?: string }> {
  const res = await grantMonthlyPlanTokenReward(userEmailOrId, {
    customTokens: options?.customTokens,
    orderId: options?.orderId,
    planSlug,
    planName: options?.planName,
    force: true
  });
  return {
    success: res.success,
    tokensGranted: res.tokensGranted,
    newBalance: res.newBalance,
    error: res.reason || res.error
  };
}

export async function grantUserTokens(
  userEmailOrId: string,
  tokens: number = 100,
  reason: string = 'Admin grant'
): Promise<any> {
  return grantMonthlyPlanTokenReward(userEmailOrId, { customTokens: tokens, force: true, reason });
}

export async function deleteTokenTransactionsAndSyncBalance(idsOrPayload: any): Promise<DeleteTransactionsResult> {
  await initTokenTables();

  let validIds: string[] = [];
  if (Array.isArray(idsOrPayload)) {
    validIds = idsOrPayload.map(String).filter(Boolean);
  } else if (typeof idsOrPayload === 'object' && idsOrPayload !== null) {
    const candidate = idsOrPayload.ids || idsOrPayload.transactionIds || idsOrPayload.id;
    if (Array.isArray(candidate)) {
      validIds = candidate.map(String).filter(Boolean);
    } else if (candidate) {
      validIds = [String(candidate)].filter(Boolean);
    }
  } else if (typeof idsOrPayload === 'string' && idsOrPayload) {
    validIds = [idsOrPayload];
  }

  if (validIds.length === 0) {
    return { success: true, deletedCount: 0, affectedUsers: [], affectedUserIds: [] };
  }

  try {
    const placeholders = validIds.map((_, i) => `$${i + 1}`).join(',');
    const txRows = await query(`
      SELECT id, user_id, user_email, amount, type, description 
      FROM token_transactions 
      WHERE id IN (${placeholders})
    `, validIds);

    const rawTxs = parseDbRows(txRows);
    if (rawTxs.length === 0) {
      return { success: true, deletedCount: 0, affectedUsers: [], affectedUserIds: [] };
    }

    const userAdjustments: Record<string, { userId: string; userEmail: string; netChange: number; types: string[] }> = {};
    for (const tx of rawTxs) {
      const uKey = (tx.user_id || tx.user_email || '').toLowerCase().trim();
      if (!uKey) continue;
      if (!userAdjustments[uKey]) {
        userAdjustments[uKey] = {
          userId: tx.user_id,
          userEmail: tx.user_email || '',
          netChange: 0,
          types: []
        };
      }
      userAdjustments[uKey].netChange -= Number(tx.amount || 0);
      userAdjustments[uKey].types.push(tx.type);
    }

    const affectedUsers: AffectedUserBalance[] = [];

    for (const item of Object.values(userAdjustments)) {
      if (item.netChange === 0) continue;

      let uRow: any = null;
      if (item.userId) {
        const rows = await query('SELECT id, email, token_balance FROM users WHERE id = $1 LIMIT 1', [item.userId]);
        const list = parseDbRows(rows);
        if (list.length > 0) uRow = list[0];
      }
      if (!uRow && item.userEmail) {
        const rows = await query('SELECT id, email, token_balance FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1', [item.userEmail.trim()]);
        const list = parseDbRows(rows);
        if (list.length > 0) uRow = list[0];
      }

      if (uRow) {
        const oldBalance = Number(uRow.token_balance ?? 0);
        const updatedBal = Math.max(0, oldBalance + item.netChange);

        await query(`
          UPDATE users 
          SET token_balance = $1, updated_at = NOW() 
          WHERE id = $2
        `, [updatedBal, uRow.id]);

        if (item.types.includes('plan_monthly_grant')) {
          await query(`
            UPDATE users 
            SET last_token_grant_cycle = NULL, updated_at = NOW() 
            WHERE id = $1
          `, [uRow.id]).catch(() => {});
        }

        affectedUsers.push({
          id: uRow.id,
          email: uRow.email,
          oldBalance,
          newBalance: updatedBal,
          adjustedTokens: item.netChange
        });
      }
    }

    await query(`
      DELETE FROM token_transactions 
      WHERE id IN (${placeholders})
    `, validIds);

    return {
      success: true,
      deletedCount: rawTxs.length,
      affectedUsers,
      affectedUserIds: affectedUsers.map(u => u.id)
    };
  } catch (err: any) {
    console.error('deleteTokenTransactionsAndSyncBalance error:', err);
    return {
      success: false,
      error: err.message || 'Failed deleting transactions',
      deletedCount: 0,
      affectedUsers: [],
      affectedUserIds: []
    };
  }
}
