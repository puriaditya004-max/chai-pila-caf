const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: SQLite jaisi sync feel ke liye async wrapper
const db = {
  // Single row fetch
  prepare: (sql) => ({
    get: async (...params) => {
      const result = await pool.query(sql.replace(/\?/g, (_, i) => `$${++i}`), params);
      return result.rows[0] || null;
    },
    all: async (...params) => {
      const result = await pool.query(sql.replace(/\?/g, (_, i) => `$${++i}`), params);
      return result.rows;
    },
    run: async (...params) => {
      const result = await pool.query(sql.replace(/\?/g, (_, i) => `$${++i}`), params);
      return { lastInsertRowid: result.rows[0]?.id || null, changes: result.rowCount };
    }
  }),
  exec: async (sql) => {
    await pool.query(sql);
  },
  transaction: (fn) => async (data) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await fn(data);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
  query: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return result.rows;
  }
};

// ── CREATE ALL TABLES ──
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      old_price REAL,
      category TEXT DEFAULT '',
      emoji TEXT DEFAULT '🍽️',
      image_url TEXT DEFAULT '',
      is_available INTEGER DEFAULT 1,
      is_bestseller INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
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
      last_order_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'flat',
      amount REAL DEFAULT 0,
      min_order REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      valid_till TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_phone TEXT NOT NULL,
      referred_phone TEXT NOT NULL,
      referred_name TEXT DEFAULT '',
      reward_type TEXT DEFAULT 'fixed',
      reward_amount INTEGER DEFAULT 0,
      is_lifetime INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
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
      id SERIAL PRIMARY KEY,
      customer_phone TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      reason TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      customer_phone TEXT NOT NULL,
      coins INTEGER DEFAULT 0,
      type TEXT DEFAULT 'credit',
      reason TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id SERIAL PRIMARY KEY,
      customer_phone TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_price REAL DEFAULT 0,
      item_emoji TEXT DEFAULT '🍽️',
      added_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      id SERIAL PRIMARY KEY,
      rank INTEGER DEFAULT 0,
      display_name TEXT NOT NULL,
      tag TEXT DEFAULT '',
      orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      is_manual INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT NOW()
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
      id SERIAL PRIMARY KEY,
      customer_phone TEXT NOT NULL,
      task_type TEXT DEFAULT 'orders',
      target_count INTEGER DEFAULT 5,
      current_count INTEGER DEFAULT 0,
      reward_item TEXT DEFAULT 'Free Chai',
      status TEXT DEFAULT 'in_progress',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS today_special (
      id SERIAL PRIMARY KEY,
      item_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL DEFAULT 0,
      old_price REAL DEFAULT 0,
      emoji TEXT DEFAULT '🍽️',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cafe_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      is_open INTEGER DEFAULT 1,
      opens_at TEXT DEFAULT '09:00',
      closes_at TEXT DEFAULT '23:00',
      closed_message TEXT DEFAULT 'Cafe abhi band hai. Kal aana!'
    );

    CREATE TABLE IF NOT EXISTS upsell_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🍽️',
      original_price REAL DEFAULT 0,
      offer_price REAL DEFAULT 0,
      offer_text TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Default data
  await pool.query(`INSERT INTO admin (username, password) VALUES ('admin', 'chaipila123') ON CONFLICT (username) DO NOTHING`);
  await pool.query(`INSERT INTO referral_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await pool.query(`INSERT INTO reward_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await pool.query(`INSERT INTO delivery_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await pool.query(`INSERT INTO free_item_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await pool.query(`INSERT INTO cafe_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  console.log('✅ PostgreSQL Database ready!');
}

initDB().catch(console.error);

module.exports = { pool, db };
