
cat << 'ENDOFFILE' > /home/claude/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIGRATIONS - Purane database ke liye ──
const migrations = [
  `ALTER TABLE referrals ADD COLUMN reward_type TEXT DEFAULT 'fixed'`,
  `ALTER TABLE referrals ADD COLUMN reward_amount INTEGER DEFAULT 0`,
  `ALTER TABLE referrals ADD COLUMN is_lifetime INTEGER DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'delivery'`,
  `ALTER TABLE customers ADD COLUMN coins INTEGER DEFAULT 0`,
  `ALTER TABLE customers ADD COLUMN referral_code TEXT DEFAULT ''`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch(e) { /* already exists */ }
}
console.log('✅ Migrations done!');

// ============================
//  MIDDLEWARE
// ============================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
//  ADMIN AUTH
// ============================
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = db.prepare('SELECT * FROM admin WHERE username = ? AND password = ?').get(username, password);
    if (!admin) return res.status(401).json({ success: false, message: 'Galat username ya password!' });
    res.json({ success: true, message: 'Login ho gaya!', token: 'chaipila-admin-token' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Login error' });
  }
});

// ============================
//  MENU ROUTES
// ============================
app.get('/api/menu', (req, res) => {
  try {
    const { category } = req.query;
    let items;
    if (category) {
      items = db.prepare('SELECT * FROM menu_items WHERE category = ? AND is_available = 1').all(category);
    } else {
      items = db.prepare('SELECT * FROM menu_items ORDER BY category, id').all();
    }
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Menu load karne mein error' });
  }
});

app.get('/api/menu/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT DISTINCT category FROM menu_items WHERE is_available = 1').all();
    res.json({ success: true, data: categories.map(c => c.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Categories load karne mein error' });
  }
});

app.get('/api/menu/:id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item nahi mila' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

app.post('/api/menu', (req, res) => {
  try {
    const { name, category, price, old_price, emoji, description, is_bestseller } = req.body;
    const result = db.prepare(`
      INSERT INTO menu_items (name, category, price, old_price, emoji, description, is_bestseller)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, category, price || 0, old_price || null, emoji || '🍽️', description || '', is_bestseller || 0);
    res.json({ success: true, message: 'Item add ho gaya!', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Item add karne mein error' });
  }
});

app.put('/api/menu/:id', (req, res) => {
  try {
    const { name, category, price, old_price, emoji, description, is_bestseller, is_available } = req.body;
    db.prepare(`
      UPDATE menu_items SET name=?, category=?, price=?, old_price=?, emoji=?, description=?, is_bestseller=?, is_available=?
      WHERE id=?
    `).run(name, category, price, old_price || null, emoji, description, is_bestseller, is_available, req.params.id);
    res.json({ success: true, message: 'Item update ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update mein error' });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Item delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delete mein error' });
  }
});

app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const items = db.prepare(
      "SELECT * FROM menu_items WHERE (name LIKE ? OR description LIKE ?) AND is_available = 1"
    ).all(`%${q}%`, `%${q}%`);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Search mein error' });
  }
});

// ============================
//  ORDER ROUTES
// ============================
app.post('/api/orders', (req, res) => {
  try {
    const { items, subtotal, deliveryFee, total, customer_name, customer_phone, customer_address, instructions, coupon_code, discount, payment_method, order_type } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart khali hai bhai!' });
    }

    const orderResult = db.prepare(`
      INSERT INTO orders (customer_name, customer_phone, customer_address, items_json, subtotal, delivery_fee, discount, total, status, payment_method, instructions, coupon_code, order_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
    `).run(
      customer_name || 'Guest',
      customer_phone || '',
      customer_address || '',
      JSON.stringify(items),
      subtotal,
      deliveryFee || 20,
      discount || 0,
      total,
      payment_method || 'COD',
      instructions || '',
      coupon_code || '',
      order_type || 'delivery'
    );

    const orderId = orderResult.lastInsertRowid;

    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, item_name, price, quantity)
      VALUES (?, ?, ?, ?)
    `);

    db.transaction((orderItems) => {
      for (const item of orderItems) {
        insertOrderItem.run(orderId, item.name, item.price, item.quantity);
      }
    })(items);

    if (customer_phone) {
      const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customer_phone);
      if (existing) {
        db.prepare(`
          UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ?, last_order_at = CURRENT_TIMESTAMP WHERE phone = ?
        `).run(total, customer_phone);
      } else {
        db.prepare(`
          INSERT INTO customers (name, phone, address, total_orders, total_spent, last_order_at)
          VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
        `).run(customer_name || 'Guest', customer_phone, customer_address || '', total);
      }
      updateCustomerCategory(customer_phone);
    }

    res.status(201).json({
      success: true,
      message: '🎉 Order place ho gaya! Thoda wait karo, jaldi aayega.',
      order_id: orderId,
      estimated_time: '25-35 minutes'
    });

  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: 'Order place karne mein error aaya' });
  }
});

function updateCustomerCategory(phone) {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (!customer) return;
    const lastOrder = customer.last_order_at ? new Date(customer.last_order_at) : null;
    const now = new Date();
    const daysDiff = lastOrder ? (now - lastOrder) / (1000 * 60 * 60 * 24) : 999;
    let category = 'bronze';
    if (customer.total_spent > 5000) category = 'vip';
    else if (daysDiff <= 1) category = 'platinum';
    else if (daysDiff <= 2) category = 'diamond';
    else if (daysDiff <= 6) category = 'gold';
    else if (daysDiff <= 15) category = 'silver';
    else category = 'bronze';
    db.prepare('UPDATE customers SET category = ? WHERE phone = ?').run(category, phone);
  } catch (err) {
    console.error('Category update error:', err);
  }
}

app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    const ordersWithItems = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json)
    }));
    res.json({ success: true, data: ordersWithItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders fetch karne mein error' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order nahi mila' });
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ success: true, data: { ...order, items: orderItems } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `Order status updated: ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Status update mein error' });
  }
});

// ============================
//  COUPON ROUTES
// ============================
app.get('/api/coupons', (req, res) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Coupons fetch error' });
  }
});

app.post('/api/coupons', (req, res) => {
  try {
    const { code, type, amount, min_order, max_uses, valid_till } = req.body;
    db.prepare(`INSERT INTO coupons (code, type, amount, min_order, max_uses, valid_till) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(code.toUpperCase(), type || 'flat', amount, min_order || 0, max_uses || 1, valid_till || '');
    res.json({ success: true, message: 'Coupon ban gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Coupon create error' });
  }
});

app.post('/api/coupons/validate', (req, res) => {
  try {
    const { code, order_total } = req.body;
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code.toUpperCase());
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon nahi mila ya expired hai!' });
    if (coupon.used_count >= coupon.max_uses) return res.status(400).json({ success: false, message: 'Coupon limit khatam ho gayi!' });
    if (coupon.min_order > 0 && order_total < coupon.min_order) return res.status(400).json({ success: false, message: `Minimum order ₹${coupon.min_order} hona chahiye!` });
    if (coupon.valid_till && new Date(coupon.valid_till) < new Date()) return res.status(400).json({ success: false, message: 'Coupon expire ho gaya!' });
    let discount = coupon.amount;
    if (coupon.type === 'percent') discount = Math.floor((order_total * coupon.amount) / 100);
    res.json({ success: true, discount, message: `🎉 ₹${discount} discount mila!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Coupon validate error' });
  }
});

app.delete('/api/coupons/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Coupon delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delete error' });
  }
});

// ============================
//  CUSTOMER ROUTES
// ============================
app.get('/api/customers', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY total_spent DESC').all();
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Customers fetch error' });
  }
});

app.put('/api/customers/:id', (req, res) => {
  try {
    const { name, address, dob, gender } = req.body;
    db.prepare('UPDATE customers SET name=?, address=?, dob=?, gender=? WHERE id=?').run(name, address, dob, gender, req.params.id);
    res.json({ success: true, message: 'Customer update ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update error' });
  }
});

// ============================
//  REWARD ROUTES
// ============================
app.get('/api/rewards/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM reward_settings WHERE id = 1').get();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Settings fetch error' });
  }
});

app.put('/api/rewards/settings', (req, res) => {
  try {
    const { is_active, points_per_order, point_value, validity_days } = req.body;
    db.prepare('UPDATE reward_settings SET is_active=?, points_per_order=?, point_value=?, validity_days=? WHERE id=1')
      .run(is_active, points_per_order, point_value, validity_days);
    res.json({ success: true, message: 'Reward settings save ho gayi!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Settings update error' });
  }
});

app.post('/api/rewards/add', (req, res) => {
  try {
    const { customer_phone, points, reason } = req.body;
    db.prepare('INSERT INTO rewards (customer_phone, points, reason) VALUES (?, ?, ?)').run(customer_phone, points, reason || 'Admin ne add kiya');
    db.prepare('UPDATE customers SET reward_points = reward_points + ? WHERE phone = ?').run(points, customer_phone);
    res.json({ success: true, message: `${points} points add ho gaye!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Reward add error' });
  }
});

// ============================
//  SALES ROUTES
// ============================
app.get('/api/sales/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const orders = db.prepare(`SELECT * FROM orders WHERE DATE(created_at) = ? AND status != 'cancelled'`).all(today);
    const totalSale = orders.reduce((sum, o) => sum + o.total, 0);
    res.json({ success: true, data: { totalSale, totalOrders: orders.length, orders } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Sales fetch error' });
  }
});

app.get('/api/sales/history', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as total_orders, SUM(total) as total_sale
      FROM orders WHERE status != 'cancelled'
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
    `).all();
    res.json({ success: true, data: sales });
  } catch (err) {
    res.status(500).json({ success: false, message: 'History fetch error' });
  }
});

// ============================
//  DELIVERY SETTINGS
// ============================
app.get('/api/delivery/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM delivery_settings WHERE id = 1').get();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delivery settings fetch error' });
  }
});

app.put('/api/delivery/settings', (req, res) => {
  try {
    const { base_charge, per_km_charge, free_delivery_above } = req.body;
    db.prepare('UPDATE delivery_settings SET base_charge=?, per_km_charge=?, free_delivery_above=? WHERE id=1')
      .run(base_charge, per_km_charge, free_delivery_above);
    res.json({ success: true, message: 'Delivery settings save ho gayi!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Settings update error' });
  }
});

// ============================
//  HEALTH CHECK
// ============================
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Chai Pila Backend chal raha hai! ☕', timestamp: new Date().toISOString() });
});

// ============================
//  WISHLIST ROUTES
// ============================
app.post('/api/wishlist/add', (req, res) => {
  try {
    const { customer_phone, item_id, item_name, item_price, item_emoji } = req.body;
    const existing = db.prepare('SELECT * FROM wishlists WHERE customer_phone = ? AND item_id = ?').get(customer_phone, item_id);
    if (existing) return res.json({ success: false, message: 'Already wishlist mein hai!' });
    db.prepare('INSERT INTO wishlists (customer_phone, item_id, item_name, item_price, item_emoji) VALUES (?, ?, ?, ?, ?)').run(customer_phone, item_id, item_name, item_price, item_emoji || '🍽️');
    res.json({ success: true, message: 'Wishlist mein add ho gaya! ❤️' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/wishlist/:phone', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM wishlists WHERE customer_phone = ? ORDER BY added_at DESC').all(req.params.phone);
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.delete('/api/wishlist/:phone/:item_id', (req, res) => {
  try {
    db.prepare('DELETE FROM wishlists WHERE customer_phone = ? AND item_id = ?').run(req.params.phone, req.params.item_id);
    res.json({ success: true, message: 'Wishlist se remove ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/admin/wishlists', (req, res) => {
  try {
    const items = db.prepare('SELECT w.*, c.name as customer_name FROM wishlists w LEFT JOIN customers c ON w.customer_phone = c.phone ORDER BY w.added_at DESC').all();
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  REFERRAL ROUTES
// ============================
app.get('/api/referral/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get();
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/referral/settings', (req, res) => {
  try {
    const { is_active, reward_type, reward_amount, is_lifetime, lifetime_percent, max_limit } = req.body;
    db.prepare('UPDATE referral_settings SET is_active=?, reward_type=?, reward_amount=?, is_lifetime=?, lifetime_percent=?, max_limit=? WHERE id=1')
      .run(is_active, reward_type, reward_amount, is_lifetime, lifetime_percent, max_limit);
    res.json({ success: true, message: 'Referral settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/referral/apply', (req, res) => {
  try {
    const { referrer_phone, referred_phone, referred_name } = req.body;
    if (referrer_phone === referred_phone) return res.status(400).json({ success: false, message: 'Apne aap ko refer nahi kar sakte!' });
    const existing = db.prepare('SELECT * FROM referrals WHERE referred_phone = ?').get(referred_phone);
    if (existing) return res.status(400).json({ success: false, message: 'Yeh number pehle se refer ho chuka hai!' });
    const settings = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get();
    db.prepare('INSERT INTO referrals (referrer_phone, referred_phone, referred_name, reward_type, reward_amount, is_lifetime, status) VALUES (?, ?, ?, ?, ?, ?, "active")')
      .run(referrer_phone, referred_phone, referred_name || '', settings.reward_type, settings.reward_amount, settings.is_lifetime);
    db.prepare('INSERT INTO wallet_transactions (customer_phone, coins, type, reason) VALUES (?, ?, "credit", "Referral Bonus")').run(referrer_phone, settings.reward_amount);
    db.prepare('UPDATE customers SET reward_points = reward_points + ? WHERE phone = ?').run(settings.reward_amount, referrer_phone);
    res.json({ success: true, message: `Referral applied! ${settings.reward_amount} coins mile! 🎉` });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/referral/history', (req, res) => {
  try {
    const referrals = db.prepare('SELECT * FROM referrals ORDER BY created_at DESC').all();
    res.json({ success: true, data: referrals });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/referral/history/:phone', (req, res) => {
  try {
    const referrals = db.prepare('SELECT * FROM referrals WHERE referrer_phone = ? ORDER BY created_at DESC').all(req.params.phone);
    res.json({ success: true, data: referrals });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  LEADERBOARD ROUTES
// ============================
app.get('/api/leaderboard', (req, res) => {
  try {
    const entries = db.prepare('SELECT * FROM leaderboard WHERE is_visible = 1 ORDER BY rank ASC').all();
    res.json({ success: true, data: entries });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/admin/leaderboard', (req, res) => {
  try {
    const entries = db.prepare('SELECT * FROM leaderboard ORDER BY rank ASC').all();
    res.json({ success: true, data: entries });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/admin/leaderboard', (req, res) => {
  try {
    const { rank, display_name, tag, orders, total_spent, is_manual, is_visible } = req.body;
    db.prepare('INSERT INTO leaderboard (rank, display_name, tag, orders, total_spent, is_manual, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(rank, display_name, tag, orders || 0, total_spent || 0, is_manual || 1, is_visible ?? 1);
    res.json({ success: true, message: 'Entry add ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/admin/leaderboard/:id', (req, res) => {
  try {
    const { rank, display_name, tag, orders, total_spent, is_visible } = req.body;
    db.prepare('UPDATE leaderboard SET rank=?, display_name=?, tag=?, orders=?, total_spent=?, is_visible=? WHERE id=?')
      .run(rank, display_name, tag, orders, total_spent, is_visible, req.params.id);
    res.json({ success: true, message: 'Updated!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.delete('/api/admin/leaderboard/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM leaderboard WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Delete ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  FREE ITEM ROUTES
// ============================
app.get('/api/free-item/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM free_item_settings WHERE id = 1').get();
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/free-item/settings', (req, res) => {
  try {
    const { is_active, task_type, target_count, reward_item } = req.body;
    db.prepare('UPDATE free_item_settings SET is_active=?, task_type=?, target_count=?, reward_item=? WHERE id=1')
      .run(is_active, task_type, target_count, reward_item);
    res.json({ success: true, message: 'Free item settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/free-item/tasks', (req, res) => {
  try {
    const tasks = db.prepare('SELECT * FROM free_item_tasks ORDER BY created_at DESC').all();
    res.json({ success: true, data: tasks });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/free-item/progress/:phone', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM free_item_settings WHERE id = 1').get();
    let task = db.prepare('SELECT * FROM free_item_tasks WHERE customer_phone = ? AND status = "in_progress"').get(req.params.phone);
    if (!task) {
      db.prepare('INSERT INTO free_item_tasks (customer_phone, task_type, target_count, reward_item) VALUES (?, ?, ?, ?)')
        .run(req.params.phone, settings.task_type, settings.target_count, settings.reward_item);
      task = db.prepare('SELECT * FROM free_item_tasks WHERE customer_phone = ? AND status = "in_progress"').get(req.params.phone);
    }
    res.json({ success: true, data: task });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  WALLET ROUTES
// ============================
app.get('/api/wallet/:phone', (req, res) => {
  try {
    const customer = db.prepare('SELECT reward_points FROM customers WHERE phone = ?').get(req.params.phone);
    const history = db.prepare('SELECT * FROM wallet_transactions WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 20').all(req.params.phone);
    res.json({ success: true, data: { balance: customer ? customer.reward_points : 0, history } });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  ANALYTICS ROUTES
// ============================
app.get('/api/analytics', (req, res) => {
  try {
    const bestSelling = db.prepare(`SELECT item_name, SUM(quantity) as total_qty FROM order_items GROUP BY item_name ORDER BY total_qty DESC LIMIT 10`).all();
    const peakHours = db.prepare(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count FROM orders GROUP BY hour ORDER BY count DESC LIMIT 5`).all();
    const repeatCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE total_orders > 1').get();
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
    const couponPerf = db.prepare(`SELECT coupon_code, COUNT(*) as used_times, SUM(discount) as total_discount FROM orders WHERE coupon_code != '' GROUP BY coupon_code`).all();
    const dailyRevenue = db.prepare(`SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders FROM orders WHERE status != 'cancelled' GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7`).all();
    res.json({ success: true, data: { bestSelling, peakHours, repeatCustomers: repeatCustomers.count, totalCustomers: totalCustomers.count, couponPerf, dailyRevenue } });
  } catch (err) { res.status(500).json({ success: false, message: 'Analytics error' }); }
});

// ============================
//  TODAY SPECIAL ROUTES
// ============================
app.get('/api/today-special', (req, res) => {
  try {
    const special = db.prepare('SELECT * FROM today_special WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1').get();
    res.json({ success: true, data: special || null });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/today-special', (req, res) => {
  try {
    const { item_name, description, price, old_price, emoji } = req.body;
    db.prepare('UPDATE today_special SET is_active = 0').run();
    db.prepare('INSERT INTO today_special (item_name, description, price, old_price, emoji, is_active) VALUES (?, ?, ?, ?, ?, 1)')
      .run(item_name, description || '', price, old_price || 0, emoji || '🍽️');
    res.json({ success: true, message: "Today's special set ho gaya!" });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  FRONTEND SERVE
// ============================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
//  SERVER START
// ============================
app.listen(PORT, () => {
  console.log(`☕ Chai Pila Backend chal raha hai! Port: ${PORT}`);
});
ENDOFFILE
echo "Done! Lines: $(wc -l < /home/claude/server.js)"
