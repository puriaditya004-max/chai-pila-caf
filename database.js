const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chai_pila.db');
const db = new Database(DB_PATH);

// ── CREATE ALL TABLES ──
db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    old_price REAL,
    category TEXT DEFAULT '',
    emoji TEXT DEFAULT '🍽️',
    image_url TEXT DEFAULT '',
    is_available INTEGER DEFAULT 1,
    is_bestseller INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Guest',
    phone TEXT UNIQUE NOT NULL,
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    category TEXT DEFAULT 'bronze',
    level TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    upi_id TEXT DEFAULT '',
    bank_account TEXT DEFAULT '',
    bank_ifsc TEXT DEFAULT '',
    bank_holder TEXT DEFAULT '',
    coins INTEGER DEFAULT 0,
    reward_points INTEGER DEFAULT 0,
    referral_code TEXT DEFAULT '',
    total_orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    last_order_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT DEFAULT 'Guest',
    customer_phone TEXT DEFAULT '',
    customer_address TEXT DEFAULT '',
    items_json TEXT NOT NULL DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    delivery_fee REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    order_type TEXT DEFAULT 'dine_in',
    table_number INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT 'COD',
    instructions TEXT DEFAULT '',
    coupon_code TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'flat',
    amount REAL DEFAULT 0,
    min_order REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    valid_till TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_phone TEXT NOT NULL,
    referred_phone TEXT NOT NULL,
    referred_name TEXT DEFAULT '',
    reward_type TEXT DEFAULT 'fixed',
    reward_amount INTEGER DEFAULT 0,
    is_lifetime INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS referral_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    reward_type TEXT DEFAULT 'fixed',
    reward_amount INTEGER DEFAULT 50,
    is_lifetime INTEGER DEFAULT 0,
    lifetime_percent REAL DEFAULT 5,
    max_limit INTEGER DEFAULT 500
  );

  CREATE TABLE IF NOT EXISTS reward_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    points_per_order INTEGER DEFAULT 10,
    point_value REAL DEFAULT 1,
    validity_days INTEGER DEFAULT 365
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    coins INTEGER DEFAULT 0,
    type TEXT DEFAULT 'credit',
    reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    item_price REAL DEFAULT 0,
    item_emoji TEXT DEFAULT '🍽️',
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rank INTEGER DEFAULT 0,
    display_name TEXT NOT NULL,
    tag TEXT DEFAULT '',
    orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    is_manual INTEGER DEFAULT 1,
    is_visible INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS delivery_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    base_charge REAL DEFAULT 20,
    per_km_charge REAL DEFAULT 5,
    free_delivery_above REAL DEFAULT 299
  );

  CREATE TABLE IF NOT EXISTS free_item_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    task_type TEXT DEFAULT 'orders',
    target_count INTEGER DEFAULT 5,
    reward_item TEXT DEFAULT 'Free Chai'
  );

  CREATE TABLE IF NOT EXISTS free_item_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    task_type TEXT DEFAULT 'orders',
    target_count INTEGER DEFAULT 5,
    current_count INTEGER DEFAULT 0,
    reward_item TEXT DEFAULT 'Free Chai',
    status TEXT DEFAULT 'in_progress',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS today_special (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL DEFAULT 0,
    old_price REAL DEFAULT 0,
    emoji TEXT DEFAULT '🍽️',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cafe_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_open INTEGER DEFAULT 1,
    opens_at TEXT DEFAULT '09:00',
    closes_at TEXT DEFAULT '23:00',
    closed_message TEXT DEFAULT 'Cafe abhi band hai. Kal aana!'
  );

  CREATE TABLE IF NOT EXISTS upsell_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🍽️',
    original_price REAL DEFAULT 0,
    offer_price REAL DEFAULT 0,
    offer_text TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER DEFAULT 0,
    customer_name TEXT DEFAULT 'Walk-in Customer',
    customer_phone TEXT DEFAULT '',
    items_json TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'Cash',
    order_type TEXT DEFAULT 'dine_in',
    table_number INTEGER DEFAULT 0,
    is_manual INTEGER DEFAULT 0,
    status TEXT DEFAULT 'paid',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── DEFAULT DATA INSERT ──
const adminExists = db.prepare('SELECT id FROM admin WHERE id = 1').get();
if (!adminExists) {
  db.prepare("INSERT INTO admin (username, password) VALUES ('admin', 'chaipila123')").run();
}

const refSettingsExists = db.prepare('SELECT id FROM referral_settings WHERE id = 1').get();
if (!refSettingsExists) {
  db.prepare("INSERT INTO referral_settings (id) VALUES (1)").run();
}

const rewardSettingsExists = db.prepare('SELECT id FROM reward_settings WHERE id = 1').get();
if (!rewardSettingsExists) {
  db.prepare("INSERT INTO reward_settings (id) VALUES (1)").run();
}

const deliverySettingsExists = db.prepare('SELECT id FROM delivery_settings WHERE id = 1').get();
if (!deliverySettingsExists) {
  db.prepare("INSERT INTO delivery_settings (id) VALUES (1)").run();
}

const freeItemSettingsExists = db.prepare('SELECT id FROM free_item_settings WHERE id = 1').get();
if (!freeItemSettingsExists) {
  db.prepare("INSERT INTO free_item_settings (id) VALUES (1)").run();
}

const cafeSettingsExists = db.prepare('SELECT id FROM cafe_settings WHERE id = 1').get();
if (!cafeSettingsExists) {
  db.prepare("INSERT INTO cafe_settings (id) VALUES (1)").run();
}

// ── SAFE MIGRATIONS (purana database ke liye) ──
const migrations = [
  `ALTER TABLE customers ADD COLUMN coins INTEGER DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN reward_points INTEGER DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN referral_code TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN dob TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN gender TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN category TEXT DEFAULT 'bronze'`,
  `ALTER TABLE customers ADD COLUMN level TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN tags TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN upi_id TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN bank_account TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN bank_ifsc TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN bank_holder TEXT DEFAULT ''`,
  `ALTER TABLE customers ADD COLUMN total_orders INTEGER DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN total_spent REAL DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN last_order_at TEXT`,
  `ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine_in'`,
  `ALTER TABLE orders ADD COLUMN table_number INTEGER DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN items_json TEXT DEFAULT '[]'`,
  `ALTER TABLE orders ADD COLUMN subtotal REAL DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN coupon_code TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN instructions TEXT DEFAULT ''`,
  `ALTER TABLE referrals ADD COLUMN reward_type TEXT DEFAULT 'fixed'`,
  `ALTER TABLE referrals ADD COLUMN reward_amount INTEGER DEFAULT 0`,
  `ALTER TABLE referrals ADD COLUMN is_lifetime INTEGER DEFAULT 0`,
  `ALTER TABLE referrals ADD COLUMN referred_name TEXT DEFAULT ''`,
  `ALTER TABLE referrals ADD COLUMN referrer_phone TEXT DEFAULT ''`,
  `ALTER TABLE referrals ADD COLUMN referred_phone TEXT DEFAULT ''`,
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (e) {
    // Column already exists — ignore
  }
}

console.log('✅ Database ready!');

module.exports = db;
