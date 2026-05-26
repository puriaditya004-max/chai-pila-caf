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

// Frontend files serve karo (index.html wahi se milega)
app.use(express.static(path.join(__dirname, 'public')));

// ============================
//  MENU ROUTES
// ============================

// Saare menu items lao
app.get('/api/menu', (req, res) => {
  try {
    const { category } = req.query;
    let items;
    if (category) {
      items = db.prepare('SELECT * FROM menu_items WHERE category = ? AND is_available = 1').all(category);
    } else {
      items = db.prepare('SELECT * FROM menu_items WHERE is_available = 1 ORDER BY category, id').all();
    }
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('Menu fetch error:', err);
    res.status(500).json({ success: false, message: 'Menu load karne mein error aaya' });
  }
});

// Categories lao
app.get('/api/menu/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT DISTINCT category FROM menu_items WHERE is_available = 1').all();
    res.json({ success: true, data: categories.map(c => c.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Categories load karne mein error' });
  }
});

// Ek item ki detail
app.get('/api/menu/:id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item nahi mila' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

// Search karo
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

// Order place karo
app.post('/api/orders', (req, res) => {
  try {
    const { items, subtotal, deliveryFee, total, customer_name, customer_phone } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart khali hai bhai!' });
    }

    // Order insert karo
    const orderResult = db.prepare(`
      INSERT INTO orders (customer_name, customer_phone, items_json, subtotal, delivery_fee, total, status)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(
      customer_name || 'Guest',
      customer_phone || '',
      JSON.stringify(items),
      subtotal,
      deliveryFee || 20,
      total
    );

    const orderId = orderResult.lastInsertRowid;

    // Order items bhi save karo
    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, item_name, price, quantity)
      VALUES (?, ?, ?, ?)
    `);

    const insertItems = db.transaction((orderItems) => {
      for (const item of orderItems) {
        insertOrderItem.run(orderId, item.name, item.price, item.quantity);
      }
    });

    insertItems(items);

    res.status(201).json({
      success: true,
      message: '🎉 Order place ho gaya! Thoda wait karo, jaldi aayega.',
      order_id: orderId,
      estimated_time: '25-35 minutes'
    });

  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: 'Order place karne mein error aaya, dobara try karo' });
  }
});

// Saare orders dekho (admin ke liye)
app.get('/api/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    // Har order ke items bhi attach karo
    const ordersWithItems = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json)
    }));
    res.json({ success: true, data: ordersWithItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders fetch karne mein error' });
  }
});

// Ek order ki detail
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

// Order status update (admin)
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
//  HEALTH CHECK
// ============================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Chai Pila Backend chal raha hai! ☕',
    timestamp: new Date().toISOString()
  });
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
  console.log(`
  ☕ ====================================
     Chai Pila Backend chal raha hai!
     Port: ${PORT}
     API: http://localhost:${PORT}/api
  ====================================
  `);
});
