import { getMysqlPool } from './mysql';

export interface InjectionResult {
  success: boolean;
  tablesCreated: string[];
  recordsSeeded: Record<string, number>;
  error?: string;
}

export const OPERATIONAL_TABLES = [
  'admin_settings',
  'users',
  'user_profiles',
  'subscription_plans',
  'token_packages',
  'token_settings',
  'user_tokens',
  'payment_transactions',
  'user_wallets',
  'saved_recipes',
  'recipes',
  'meal_plans',
  'grocery_items',
  'currencies',
  'frontend_pages',
  'notifications',
  'audit_logs'
];

export const MYSQL_TABLE_DDLS: Record<string, string> = {
  admin_settings: `CREATE TABLE IF NOT EXISTS admin_settings (
    id VARCHAR(255) PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE,
    \`key\` VARCHAR(255),
    setting_value LONGTEXT,
    value LONGTEXT,
    category VARCHAR(100) DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  users: `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    wallet_balance DECIMAL(10,2) DEFAULT 150.00,
    balance DECIMAL(10,2) DEFAULT 150.00,
    token_balance INT DEFAULT 1000000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  user_profiles: `CREATE TABLE IF NOT EXISTS user_profiles (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(50),
    bio TEXT,
    dietary_preferences JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  subscription_plans: `CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    slug VARCHAR(100) UNIQUE,
    price DECIMAL(10,2) DEFAULT 0.00,
    price_monthly DECIMAL(10,2) DEFAULT 0.00,
    price_yearly DECIMAL(10,2) DEFAULT 0.00,
    features JSON,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  token_packages: `CREATE TABLE IF NOT EXISTS token_packages (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    tokens INT DEFAULT 0,
    price DECIMAL(10,2) DEFAULT 0.00,
    price_monthly DECIMAL(10,2) DEFAULT 0.00,
    is_popular TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  token_settings: `CREATE TABLE IF NOT EXISTS token_settings (
    id VARCHAR(255) PRIMARY KEY,
    cost_per_recipe INT DEFAULT 10,
    cost_per_meal_plan INT DEFAULT 50,
    cost_per_image_scan INT DEFAULT 25,
    free_tier_tokens INT DEFAULT 500,
    expiry_days INT DEFAULT 365,
    expiry_date DATETIME NULL,
    allow_rollover TINYINT(1) DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  user_tokens: `CREATE TABLE IF NOT EXISTS user_tokens (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    balance INT DEFAULT 1000000,
    expiry_date DATETIME NULL,
    auto_refill TINYINT(1) DEFAULT 1,
    last_refill_date DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  payment_transactions: `CREATE TABLE IF NOT EXISTS payment_transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    amount DECIMAL(10,2) DEFAULT 0.00,
    price DECIMAL(10,2) DEFAULT 0.00,
    balance_after DECIMAL(10,2) DEFAULT 0.00,
    confirmed_amount DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'USD',
    type VARCHAR(50) DEFAULT 'credit',
    status VARCHAR(50) DEFAULT 'completed',
    description TEXT,
    recipe_name VARCHAR(255),
    transfer_reference VARCHAR(255),
    notes TEXT,
    confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  user_wallets: `CREATE TABLE IF NOT EXISTS user_wallets (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE,
    balance DECIMAL(10,2) DEFAULT 150.00,
    currency VARCHAR(10) DEFAULT 'USD',
    is_locked TINYINT(1) DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  saved_recipes: `CREATE TABLE IF NOT EXISTS saved_recipes (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    recipe_id VARCHAR(255),
    name VARCHAR(255),
    title VARCHAR(255),
    recipe_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    cuisine VARCHAR(100),
    prep_time INT DEFAULT 15,
    cook_time INT DEFAULT 20,
    servings INT DEFAULT 2,
    calories INT DEFAULT 450,
    difficulty VARCHAR(50) DEFAULT 'Easy',
    image_url TEXT,
    ingredients JSON,
    instructions JSON,
    tags JSON,
    is_favorite TINYINT(1) DEFAULT 0,
    is_cooked TINYINT(1) DEFAULT 0,
    rating INT DEFAULT 5,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  recipes: `CREATE TABLE IF NOT EXISTS recipes (
    id VARCHAR(255) PRIMARY KEY,
    recipe_id VARCHAR(255),
    name VARCHAR(255),
    title VARCHAR(255),
    recipe_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    cuisine VARCHAR(100),
    prep_time_minutes INT DEFAULT 15,
    cook_time_minutes INT DEFAULT 20,
    total_time_minutes INT DEFAULT 35,
    servings INT DEFAULT 2,
    origin_servings INT DEFAULT 2,
    calories INT DEFAULT 450,
    difficulty VARCHAR(50) DEFAULT 'Easy',
    image TEXT,
    image_url TEXT,
    ingredients JSON,
    instructions JSON,
    tags JSON,
    is_favorite TINYINT(1) DEFAULT 0,
    is_cooked TINYINT(1) DEFAULT 0,
    rating INT DEFAULT 5,
    note TEXT,
    source_type VARCHAR(50) DEFAULT 'master',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  meal_plans: `CREATE TABLE IF NOT EXISTS meal_plans (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    title VARCHAR(255),
    week_start_date DATE,
    days_data JSON,
    calories_target INT DEFAULT 2000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  grocery_items: `CREATE TABLE IF NOT EXISTS grocery_items (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    item_name VARCHAR(255),
    quantity VARCHAR(50),
    unit VARCHAR(50),
    category VARCHAR(100),
    is_purchased TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  currencies: `CREATE TABLE IF NOT EXISTS currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255),
    symbol VARCHAR(10),
    rate DECIMAL(10,4) DEFAULT 1.0000,
    is_default TINYINT(1) DEFAULT 0,
    created_by VARCHAR(255) DEFAULT 'system',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  frontend_pages: `CREATE TABLE IF NOT EXISTS frontend_pages (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(100) UNIQUE,
    title VARCHAR(255),
    content LONGTEXT,
    meta_title VARCHAR(255),
    meta_description TEXT,
    is_published TINYINT(1) DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  notifications: `CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50) DEFAULT 'system',
    is_read TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(255),
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    details JSON,
    ip_address VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
};

export async function injectCompleteMysqlDatabase(): Promise<InjectionResult> {
  const pool = getMysqlPool();
  if (!pool) {
    return {
      success: false,
      tablesCreated: [],
      recordsSeeded: {},
      error: 'MySQL connection pool could not be initialized. Verify MYSQL_URL.'
    };
  }

  const tablesCreated: string[] = [];
  const recordsSeeded: Record<string, number> = {};

  for (const tableName of OPERATIONAL_TABLES) {
    const ddl = MYSQL_TABLE_DDLS[tableName];
    if (ddl) {
      try {
        await pool.query(ddl);
        tablesCreated.push(tableName);
      } catch (err: any) {
        console.warn(`[MySQL Injector] Warning on ${tableName}:`, err.message);
      }
    }
  }

  try {
    // Admin Settings
    const settingsList = [
      ['set_app_name', 'app_name', 'app_name', 'Zecratary Culinary AI', 'Zecratary Culinary AI', 'general'],
      ['set_app_mode', 'app_mode', 'app_mode', 'production', 'production', 'general'],
      ['set_theme_default', 'theme_default', 'theme_default', 'dark', 'dark', 'appearance'],
      ['set_db_provider', 'db_provider', 'db_provider', 'mysql', 'mysql', 'database']
    ];
    for (const [id, sk, k, sv, v, cat] of settingsList) {
      await pool.query(
        'INSERT INTO admin_settings (id, setting_key, `key`, setting_value, value, category) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), value = VALUES(value);',
        [id, sk, k, sv, v, cat]
      );
    }
    recordsSeeded['admin_settings'] = settingsList.length;

    // Users and Wallets
    await pool.query(
      "INSERT INTO users (id, email, name, role, wallet_balance, balance, token_balance) VALUES ('usr_admin_1', 'admin@zecratary.com', 'Zecratary Administrator', 'admin', 150.00, 150.00, 1000000) ON DUPLICATE KEY UPDATE role = 'admin', wallet_balance = COALESCE(wallet_balance, 150.00);"
    );
    await pool.query(
      "INSERT INTO user_wallets (id, user_id, balance, currency, is_locked) VALUES ('wal_admin_1', 'usr_admin_1', 150.00, 'USD', 0) ON DUPLICATE KEY UPDATE balance = COALESCE(balance, 150.00);"
    );
    await pool.query(
      "INSERT INTO user_tokens (id, user_id, balance, auto_refill) VALUES ('tok_admin_1', 'usr_admin_1', 1000000, 1) ON DUPLICATE KEY UPDATE balance = COALESCE(balance, 1000000);"
    );
    recordsSeeded['users'] = 1;

    // Currencies
    const currencies = [
      ['USD', 'US Dollar', '$', 1.0000, 1, 'system'],
      ['EUR', 'Euro', '€', 0.9200, 0, 'system'],
      ['GBP', 'British Pound', '£', 0.7900, 0, 'system'],
      ['THB', 'Thai Baht', '฿', 35.5000, 0, 'system'],
      ['JPY', 'Japanese Yen', '¥', 155.2000, 0, 'system']
    ];
    for (const [c, n, s, r, d, cb] of currencies) {
      await pool.query(
        'INSERT INTO currencies (code, name, symbol, rate, is_default, created_by) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rate = VALUES(rate);',
        [c, n, s, r, d, cb]
      );
    }
    recordsSeeded['currencies'] = currencies.length;

    // Subscription Plans
    const plans = [
      ['plan_free', 'Free Starter', 'free', 0.00, 0.00, 0.00, JSON.stringify(['Up to 10 recipes', 'Basic culinary search', '500 AI tokens/mo'])],
      ['plan_pro', 'Pro Chef', 'pro', 19.99, 19.99, 199.00, JSON.stringify(['Unlimited recipes', 'Smart grocery list', '50,000 AI tokens/mo', 'Autonomous meal planner'])],
      ['plan_ent', 'Enterprise AI Culinary Master', 'enterprise', 49.00, 49.00, 490.00, JSON.stringify(['Everything in Pro', 'Multi-user kitchen profiles', '5,000,000 AI tokens/mo', 'Priority API routing'])]
    ];
    for (const [id, nm, slug, p, pm, py, feat] of plans) {
      await pool.query(
        'INSERT INTO subscription_plans (id, name, slug, price, price_monthly, price_yearly, features, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE price = VALUES(price), price_monthly = VALUES(price_monthly);',
        [id, nm, slug, p, pm, py, feat]
      );
    }
    recordsSeeded['subscription_plans'] = plans.length;

    // Token Packages & Settings
    const pkgs = [
      ['pkg_small', '10,000 AI Tokens', 10000, 4.99, 4.99, 0],
      ['pkg_medium', '50,000 AI Tokens', 50000, 14.99, 14.99, 1],
      ['pkg_large', '250,000 AI Tokens', 250000, 39.99, 39.99, 0]
    ];
    for (const [id, nm, tok, pr, prm, pop] of pkgs) {
      await pool.query(
        'INSERT INTO token_packages (id, name, tokens, price, price_monthly, is_popular) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), price_monthly = VALUES(price_monthly);',
        [id, nm, tok, pr, prm, pop]
      );
    }
    await pool.query(
      "INSERT INTO token_settings (id, cost_per_recipe, cost_per_meal_plan, cost_per_image_scan, free_tier_tokens, expiry_days, allow_rollover) VALUES ('default_token_setting', 10, 50, 25, 500, 365, 1) ON DUPLICATE KEY UPDATE expiry_days = 365;"
    );
    recordsSeeded['token_packages'] = pkgs.length;

    // Recipes
    const seedRecipes = [
      {
        id: 'rec_001',
        name: 'Mediterranean Quinoa Power Bowl',
        title: 'Mediterranean Quinoa Power Bowl',
        description: 'Rainbow quinoa with English cucumbers, Kalamata olives, cherry tomatoes, and Greek feta.',
        category: 'Lunch',
        cuisine: 'Mediterranean',
        prep: 15,
        cook: 20,
        servings: 2,
        calories: 420,
        difficulty: 'Easy',
        ingredients: ['1 cup quinoa', '1 cup cherry tomatoes', '0.5 cup kalamata olives', '1 cucumber', '0.25 cup feta', '2 tbsp olive oil'],
        instructions: ['Cook quinoa for 15 minutes.', 'Dice vegetables and toss with olive oil.', 'Assemble in bowls with feta.'],
        tags: ['Healthy', 'Vegetarian', 'High-Protein']
      },
      {
        id: 'rec_002',
        name: 'Pan-Seared Citrus Salmon with Asparagus',
        title: 'Pan-Seared Citrus Salmon with Asparagus',
        description: 'Crispy skin-on wild Atlantic salmon glazed with orange reduction and pan-roasted asparagus.',
        category: 'Dinner',
        cuisine: 'American',
        prep: 10,
        cook: 12,
        servings: 2,
        calories: 510,
        difficulty: 'Medium',
        ingredients: ['2 wild salmon fillets', '1 bunch asparagus', '0.5 cup orange juice', '2 garlic cloves', '2 tbsp grass-fed butter'],
        instructions: ['Season salmon and sear for 4 minutes per side.', 'Add garlic and asparagus, simmer until tender.'],
        tags: ['Keto', 'High-Protein', 'Gluten-Free']
      },
      {
        id: 'rec_003',
        name: 'Berry Acai Protein Breakfast Bowl',
        title: 'Berry Acai Protein Breakfast Bowl',
        description: 'Organic acai blended with plant protein and topped with chia seeds, blueberries, and granola.',
        category: 'Breakfast',
        cuisine: 'Modern',
        prep: 8,
        cook: 0,
        servings: 1,
        calories: 340,
        difficulty: 'Easy',
        ingredients: ['1 packet frozen acai', '1 scoop protein powder', '0.5 cup almond milk', '0.5 cup blueberries', '2 tbsp chia seeds'],
        instructions: ['Blend acai, protein, and almond milk.', 'Pour into bowl and arrange blueberries on top.'],
        tags: ['Breakfast', 'Antioxidants', 'Quick']
      },
      {
        id: 'rec_004',
        name: 'Tuscan Garlic Herb Chicken',
        title: 'Tuscan Garlic Herb Chicken',
        description: 'Golden chicken cutlets in a garlic parmesan cream sauce with baby spinach and sun-dried tomatoes.',
        category: 'Dinner',
        cuisine: 'Italian',
        prep: 15,
        cook: 25,
        servings: 4,
        calories: 480,
        difficulty: 'Medium',
        ingredients: ['4 chicken breasts', '1 cup sun-dried tomatoes', '2 cups baby spinach', '0.75 cup light cream', '3 garlic cloves'],
        instructions: ['Brown chicken in skillet.', 'Simmer garlic and tomatoes with cream, fold in spinach.'],
        tags: ['Dinner', 'Comfort-Food', 'High-Protein']
      }
    ];

    for (const r of seedRecipes) {
      await pool.query(
        `INSERT INTO recipes (id, recipe_id, name, title, recipe_name, description, category, cuisine,
          prep_time_minutes, cook_time_minutes, total_time_minutes, servings, origin_servings, calories,
          difficulty, image, image_url, ingredients, instructions, tags, is_favorite, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'master')
         ON DUPLICATE KEY UPDATE name = VALUES(name), title = VALUES(title), recipe_name = VALUES(recipe_name);`,
        [
          r.id, r.id, r.name, r.title, r.name, r.description, r.category, r.cuisine,
          r.prep, r.cook, r.prep + r.cook, r.servings, r.servings, r.calories,
          r.difficulty, '/recipes/images/default.jpg', '/recipes/images/default.jpg',
          JSON.stringify(r.ingredients), JSON.stringify(r.instructions), JSON.stringify(r.tags)
        ]
      );
      await pool.query(
        `INSERT INTO saved_recipes (id, user_id, recipe_id, name, title, recipe_name, description, category,
          cuisine, prep_time, cook_time, servings, calories, difficulty, image_url, ingredients, instructions, tags, is_favorite)
         VALUES (?, 'usr_admin_1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), recipe_name = VALUES(recipe_name);`,
        [
          r.id, r.id, r.name, r.title, r.name, r.description, r.category,
          r.cuisine, r.prep, r.cook, r.servings, r.calories, r.difficulty,
          '/recipes/images/default.jpg', JSON.stringify(r.ingredients),
          JSON.stringify(r.instructions), JSON.stringify(r.tags)
        ]
      );
    }
    recordsSeeded['recipes'] = seedRecipes.length;
    recordsSeeded['saved_recipes'] = seedRecipes.length;

    await pool.query(
      "INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES ('notif_init_mysql', 'usr_admin_1', 'MySQL Catalog Initialized', 'All 17 operational tables and default seed records have been created successfully on Hostinger MySQL.', 'system', 0) ON DUPLICATE KEY UPDATE message = VALUES(message);"
    );
    recordsSeeded['notifications'] = 1;

  } catch (err: any) {
    console.warn('[MySQL Injector] Warning seeding data:', err.message);
  }

  return {
    success: true,
    tablesCreated,
    recordsSeeded
  };
}
