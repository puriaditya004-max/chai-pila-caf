const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chai_pila.db');
const db = new Database(DB_PATH);

// Tables banao
db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    old_price INTEGER,
    emoji TEXT DEFAULT '🍽️',
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    is_bestseller INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT DEFAULT 'Guest',
    customer_phone TEXT DEFAULT '',
    customer_address TEXT DEFAULT '',
    items_json TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    delivery_fee INTEGER DEFAULT 20,
    discount INTEGER DEFAULT 0,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_method TEXT DEFAULT 'COD',
    instructions TEXT DEFAULT '',
    coupon_code TEXT DEFAULT '',
    order_type TEXT DEFAULT 'delivery',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    address TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    total_orders INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    reward_points INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    referral_code TEXT DEFAULT '',
    category TEXT DEFAULT 'bronze',
    last_order_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'flat',
    amount INTEGER NOT NULL,
    min_order INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    valid_till TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reward_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    is_active INTEGER DEFAULT 0,
    points_per_order INTEGER DEFAULT 10,
    point_value INTEGER DEFAULT 1,
    validity_days INTEGER DEFAULT 30
  );

  CREATE TABLE IF NOT EXISTS delivery_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_charge INTEGER DEFAULT 20,
    per_km_charge INTEGER DEFAULT 5,
    free_delivery_above INTEGER DEFAULT 500
  );

  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
`);

// Default admin banao
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin').get();
if (adminCount.c === 0) {
  db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)').run('admin', 'chaipila123');
  console.log('✅ Default admin bana: username=admin, password=chaipila123');
}

// Default reward settings
const rewardCount = db.prepare('SELECT COUNT(*) as c FROM reward_settings').get();
if (rewardCount.c === 0) {
  db.prepare('INSERT INTO reward_settings (is_active, points_per_order, point_value, validity_days) VALUES (0, 10, 1, 30)').run();
}

// Default delivery settings
const deliveryCount = db.prepare('SELECT COUNT(*) as c FROM delivery_settings').get();
if (deliveryCount.c === 0) {
  db.prepare('INSERT INTO delivery_settings (base_charge, per_km_charge, free_delivery_above) VALUES (20, 5, 500)').run();
}

// Menu seed karo agar khali hai
const menuCount = db.prepare('SELECT COUNT(*) as c FROM menu_items').get();

if (menuCount.c === 0) {
  const insertItem = db.prepare(`
    INSERT INTO menu_items (name, category, price, old_price, emoji, description, is_bestseller)
    VALUES (@name, @category, @price, @old_price, @emoji, @description, @is_bestseller)
  `);

  const menuData = [
    { name: 'Pizza Combo', category: 'combos', price: 250, old_price: 350, emoji: '🍕', description: 'Pizza + Fries + Cold Drink', is_bestseller: 1 },
    { name: 'Burger Combo', category: 'combos', price: 200, old_price: 280, emoji: '🍔', description: 'Burger + Fries + Cold Drink', is_bestseller: 1 },
    { name: 'Noodles Combo', category: 'combos', price: 220, old_price: 300, emoji: '🍜', description: 'Noodles + Soup + Mocktail', is_bestseller: 0 },
    { name: 'Sasuryadi Special Thali', category: 'thali', price: 150, old_price: null, emoji: '🍛', description: 'Dal, Sabzi, Rice, Roti, Salad, Pickle', is_bestseller: 1 },
    { name: 'Paneer Thali', category: 'thali', price: 180, old_price: null, emoji: '🧀', description: 'Paneer Sabzi, Dal, Rice, Roti', is_bestseller: 0 },
    { name: 'Chicken Thali', category: 'thali', price: 220, old_price: null, emoji: '🍗', description: 'Chicken Curry, Dal, Rice, Roti', is_bestseller: 0 },
    { name: 'Mutton Thali', category: 'thali', price: 280, old_price: null, emoji: '🍖', description: 'Mutton Curry, Dal, Rice, Roti', is_bestseller: 0 },
    { name: 'Veg Hakka Noodles', category: 'chinese', price: 70, old_price: null, emoji: '🍝', description: 'Stir-fried noodles with vegetables', is_bestseller: 0 },
    { name: 'Chicken Schezwan Noodles', category: 'chinese', price: 180, old_price: null, emoji: '🍜', description: 'Spicy, tasty & full of flavors', is_bestseller: 1 },
    { name: 'Veg Fried Rice', category: 'chinese', price: 80, old_price: null, emoji: '🍚', description: 'Stir-fried rice with vegetables', is_bestseller: 0 },
    { name: 'Chicken Fried Rice', category: 'chinese', price: 150, old_price: null, emoji: '🍗', description: 'Stir-fried rice with chicken', is_bestseller: 0 },
    { name: 'Paneer Chilly', category: 'chinese', price: 120, old_price: null, emoji: '🧀', description: 'Crispy paneer in spicy sauce', is_bestseller: 0 },
    { name: 'Chicken Manchurian', category: 'chinese', price: 160, old_price: null, emoji: '🍖', description: 'Juicy chicken in manchurian sauce', is_bestseller: 0 },
    { name: 'Margherita Pizza', category: 'pizza', price: 150, old_price: null, emoji: '🍕', description: 'Classic tomato & cheese pizza', is_bestseller: 0 },
    { name: 'Paneer Chilly Pizza', category: 'pizza', price: 180, old_price: null, emoji: '🍕', description: 'Spicy paneer with bell peppers', is_bestseller: 1 },
    { name: 'Chicken BBQ Pizza', category: 'pizza', price: 220, old_price: null, emoji: '🍕', description: 'Grilled chicken with BBQ sauce', is_bestseller: 0 },
    { name: 'Veg Supreme Pizza', category: 'pizza', price: 180, old_price: null, emoji: '🍕', description: 'Loaded with fresh veggies', is_bestseller: 0 },
    { name: 'Veg Burger', category: 'burger', price: 80, old_price: null, emoji: '🍔', description: 'Crispy veg patty with fresh veggies', is_bestseller: 0 },
    { name: 'Chicken Burger', category: 'burger', price: 130, old_price: null, emoji: '🍔', description: 'Juicy grilled chicken patty', is_bestseller: 1 },
    { name: 'Peri Peri Fries', category: 'burger', price: 80, old_price: null, emoji: '🍟', description: 'Crispy fries with peri peri seasoning', is_bestseller: 0 },
    { name: 'Aloo Tikki Burger', category: 'burger', price: 70, old_price: null, emoji: '🍔', description: 'Spiced potato patty burger', is_bestseller: 0 },
    { name: 'Veg Steamed Momos', category: 'momos', price: 80, old_price: null, emoji: '🥟', description: '8 pcs steamed veg momos', is_bestseller: 0 },
    { name: 'Chicken Fried Momos', category: 'momos', price: 120, old_price: null, emoji: '🥟', description: '8 pcs crispy chicken momos', is_bestseller: 1 },
    { name: 'Chicken Schezwan Wrap', category: 'momos', price: 100, old_price: null, emoji: '🌯', description: 'Spicy chicken wrap with veggies', is_bestseller: 0 },
    { name: 'Paneer Fried Momos', category: 'momos', price: 120, old_price: null, emoji: '🥟', description: '8 pcs crispy paneer momos', is_bestseller: 0 },
    { name: 'Cold Coffee With Ice Cream', category: 'beverages', price: 100, old_price: null, emoji: '☕', description: 'Creamy cold coffee with ice cream', is_bestseller: 1 },
    { name: 'Blue Lagoon', category: 'beverages', price: 80, old_price: null, emoji: '🧊', description: 'Refreshing blue mint mocktail', is_bestseller: 0 },
    { name: 'Lemon Mint Mojito', category: 'beverages', price: 80, old_price: null, emoji: '🍋', description: 'Fresh lemon mint cooler', is_bestseller: 0 },
    { name: 'Mango Punch', category: 'beverages', price: 50, old_price: null, emoji: '🥭', description: 'Fresh mango juice punch', is_bestseller: 0 },
    { name: 'Hot Coffee', category: 'beverages', price: 40, old_price: null, emoji: '☕', description: 'Freshly brewed hot coffee', is_bestseller: 0 },
    { name: 'Chocolate Brownie Sizzler', category: 'desserts', price: 100, old_price: null, emoji: '🍫', description: 'Warm brownie with ice cream', is_bestseller: 1 },
    { name: 'Mango Falooda', category: 'desserts', price: 100, old_price: null, emoji: '🥭', description: 'Creamy mango falooda', is_bestseller: 0 },
    { name: 'Kitkat Milk Shake', category: 'desserts', price: 100, old_price: null, emoji: '🥤', description: 'Rich Kitkat chocolate shake', is_bestseller: 0 },
    { name: 'Softy Ice Cream', category: 'desserts', price: 25, old_price: null, emoji: '🍦', description: 'Soft serve vanilla ice cream', is_bestseller: 0 },
    { name: 'Falooda with Ice Cream', category: 'desserts', price: 120, old_price: null, emoji: '🍨', description: 'Classic rose falooda with ice cream', is_bestseller: 0 },
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertItem.run(item);
    }
  });

  insertMany(menuData);
  console.log(`✅ Menu seed ho gaya: ${menuData.length} items add hue`);
}

// ============================
// NEW TABLES - Phase 2
// ============================
db.exec(`
  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    item_price INTEGER NOT NULL,
    item_emoji TEXT DEFAULT '🍽️',
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS referral_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    is_active INTEGER DEFAULT 1,
    reward_type TEXT DEFAULT 'fixed',
    reward_amount INTEGER DEFAULT 50,
    is_lifetime INTEGER DEFAULT 0,
    lifetime_percent INTEGER DEFAULT 5,
    max_limit INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rank INTEGER DEFAULT 0,
    customer_phone TEXT DEFAULT '',
    display_name TEXT NOT NULL,
    tag TEXT DEFAULT 'Food King',
    orders INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    is_manual INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS free_item_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    task_type TEXT DEFAULT 'order_count',
    target_count INTEGER DEFAULT 3,
    current_count INTEGER DEFAULT 0,
    reward_item TEXT DEFAULT '',
    status TEXT DEFAULT 'in_progress',
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS free_item_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    is_active INTEGER DEFAULT 1,
    task_type TEXT DEFAULT 'order_count',
    target_count INTEGER DEFAULT 3,
    reward_item TEXT DEFAULT 'Free Cold Coffee',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    coins INTEGER NOT NULL,
    type TEXT DEFAULT 'credit',
    reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    plan_type TEXT DEFAULT 'daily',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS today_special (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    old_price INTEGER DEFAULT 0,
    emoji TEXT DEFAULT '🍽️',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Default referral settings
const refCount = db.prepare('SELECT COUNT(*) as c FROM referral_settings').get();
if (refCount.c === 0) {
  db.prepare('INSERT INTO referral_settings (is_active, reward_type, reward_amount, is_lifetime, lifetime_percent, max_limit) VALUES (1, "fixed", 50, 0, 5, 0)').run();
}

// Default free item settings
const freeCount = db.prepare('SELECT COUNT(*) as c FROM free_item_settings').get();
if (freeCount.c === 0) {
  db.prepare('INSERT INTO free_item_settings (is_active, task_type, target_count, reward_item) VALUES (1, "order_count", 3, "Free Cold Coffee")').run();
}

// Default leaderboard fake entries
const lbCount = db.prepare('SELECT COUNT(*) as c FROM leaderboard').get();
if (lbCount.c === 0) {
  const fakeEntries = [
    { rank: 1, display_name: 'Rahul S.', tag: '👑 Food King', orders: 142, total_spent: 18500, is_manual: 1 },
    { rank: 2, display_name: 'Priya M.', tag: '🌙 Midnight Monster', orders: 118, total_spent: 15200, is_manual: 1 },
    { rank: 3, display_name: 'Arjun K.', tag: '🔥 Spice Lord', orders: 95, total_spent: 12800, is_manual: 1 },
    { rank: 4, display_name: 'Sneha T.', tag: '☕ Chai Addict', orders: 87, total_spent: 11000, is_manual: 1 },
    { rank: 5, display_name: 'Vikram P.', tag: '🍕 Pizza Beast', orders: 74, total_spent: 9500, is_manual: 1 },
    { rank: 6, display_name: 'Kavya R.', tag: '⭐ Star Customer', orders: 65, total_spent: 8200, is_manual: 1 },
    { rank: 7, display_name: 'Dev A.', tag: '🍔 Burger Hero', orders: 58, total_spent: 7100, is_manual: 1 },
    { rank: 8, display_name: 'Anjali B.', tag: '🥟 Momo Queen', orders: 49, total_spent: 6300, is_manual: 1 },
    { rank: 9, display_name: 'Rohan G.', tag: '🌶️ Chilli Champ', orders: 41, total_spent: 5400, is_manual: 1 },
    { rank: 10, display_name: 'Meera J.', tag: '🍜 Noodle Ninja', orders: 35, total_spent: 4600, is_manual: 1 },
  ];
  const insertLb = db.prepare('INSERT INTO leaderboard (rank, display_name, tag, orders, total_spent, is_manual, is_visible) VALUES (?, ?, ?, ?, ?, ?, 1)');
  for (const e of fakeEntries) insertLb.run(e.rank, e.display_name, e.tag, e.orders, e.total_spent, e.is_manual);
}

// ── MIGRATIONS - Purane database ke liye missing columns add karo ──
const migrations = [
  `ALTER TABLE referrals ADD COLUMN reward_type TEXT DEFAULT 'fixed'`,
  `ALTER TABLE referrals ADD COLUMN reward_amount INTEGER DEFAULT 0`,
  `ALTER TABLE referrals ADD COLUMN is_lifetime INTEGER DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'delivery'`,
  `ALTER TABLE customers ADD COLUMN coins INTEGER DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN referral_code TEXT DEFAULT ''`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch(e) { /* column already exists - ignore */ }
}

console.log('✅ Database ready!');
module.exports = db;
