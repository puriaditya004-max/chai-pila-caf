const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

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

// Menu item add karo (admin)
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

// Menu item update karo (admin)
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

// Menu item delete karo (admin)
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
    const { items, subtotal, deliveryFee, total, customer_name, customer_phone, customer_address, instructions, coupon_code, discount, payment_method } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart khali hai bhai!' });
    }

    const orderResult = db.prepare(`
      INSERT INTO orders (customer_name, customer_phone, customer_address, items_json, subtotal, delivery_fee, discount, total, status, payment_method, instructions, coupon_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
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
      coupon_code || ''
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

    // Customer save/update karo
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

      // Customer category update karo
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
    db.prepare(`
      INSERT INTO coupons (code, type, amount, min_order, max_uses, valid_till)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), type || 'flat', amount, min_order || 0, max_uses || 1, valid_till || '');
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
//  MONEY / SALES ROUTES
// ============================
app.get('/api/sales/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const orders = db.prepare(`SELECT * FROM orders WHERE DATE(created_at) = ? AND status != 'cancelled'`).all(today);
    const totalSale = orders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    res.json({ success: true, data: { totalSale, totalOrders, orders } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Sales fetch error' });
  }
});

app.get('/api/sales/history', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as total_orders, SUM(total) as total_sale
      FROM orders WHERE status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
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
