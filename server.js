const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool } = require('./database');

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
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM admin WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Galat username ya password!' });
    res.json({ success: true, message: 'Login ho gaya!', token: 'chaipila-admin-token' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Login error' });
  }
});

// ============================
//  CAFE SETTINGS
// ============================
app.get('/api/cafe/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cafe_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

app.put('/api/cafe/settings', async (req, res) => {
  try {
    const { is_open, opens_at, closes_at, closed_message } = req.body;
    await pool.query('UPDATE cafe_settings SET is_open=$1, opens_at=$2, closes_at=$3, closed_message=$4 WHERE id=1',
      [is_open, opens_at || '09:00', closes_at || '23:00', closed_message || 'Cafe abhi band hai!']);
    res.json({ success: true, message: is_open ? '✅ Cafe OPEN ho gaya!' : '🔴 Cafe BAND ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

// ============================
//  MENU ROUTES
// ============================
app.get('/api/menu', async (req, res) => {
  try {
    const { category } = req.query;
    let result;
    if (category) {
      result = await pool.query('SELECT * FROM menu_items WHERE category = $1 AND is_available = 1', [category]);
    } else {
      result = await pool.query('SELECT * FROM menu_items ORDER BY category, id');
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Menu load karne mein error' });
  }
});

app.get('/api/menu/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM menu_items WHERE is_available = 1');
    res.json({ success: true, data: result.rows.map(c => c.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Categories load karne mein error' });
  }
});

app.get('/api/menu/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Item nahi mila' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

app.post('/api/menu', async (req, res) => {
  try {
    const { name, category, price, old_price, emoji, description, is_bestseller } = req.body;
    const result = await pool.query(
      'INSERT INTO menu_items (name, category, price, old_price, emoji, description, is_bestseller) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name, category, price || 0, old_price || null, emoji || '🍽️', description || '', is_bestseller || 0]
    );
    res.json({ success: true, message: 'Item add ho gaya!', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Item add karne mein error' });
  }
});

app.put('/api/menu/:id', async (req, res) => {
  try {
    const { name, category, price, old_price, emoji, description, is_bestseller, is_available } = req.body;
    await pool.query(
      'UPDATE menu_items SET name=$1, category=$2, price=$3, old_price=$4, emoji=$5, description=$6, is_bestseller=$7, is_available=$8 WHERE id=$9',
      [name, category, price, old_price || null, emoji, description, is_bestseller, is_available, req.params.id]
    );
    res.json({ success: true, message: 'Item update ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update mein error' });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Item delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delete mein error' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const result = await pool.query(
      "SELECT * FROM menu_items WHERE (name ILIKE $1 OR description ILIKE $1) AND is_available = 1",
      [`%${q}%`]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Search mein error' });
  }
});

// ============================
//  ORDER ROUTES
// ============================
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      items, subtotal, deliveryFee, total,
      customer_name, customer_phone, customer_address,
      instructions, coupon_code, discount,
      payment_method, order_type, table_number
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart khali hai bhai!' });
    }

    await client.query('BEGIN');

    const orderResult = await client.query(`
      INSERT INTO orders (customer_name, customer_phone, customer_address, items_json, subtotal, delivery_fee, discount, total, status, payment_method, instructions, coupon_code, order_type, table_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,$12,$13) RETURNING id`,
      [customer_name || 'Guest', customer_phone || '', customer_address || '',
       JSON.stringify(items), subtotal, deliveryFee || 0, discount || 0, total,
       payment_method || 'Cash', instructions || '', coupon_code || '',
       order_type || 'dine_in', table_number || 0]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_name, price, quantity) VALUES ($1,$2,$3,$4)',
        [orderId, item.name, item.price, item.quantity || item.qty || 1]
      );
    }

    // Auto-create bill
    await client.query(`
      INSERT INTO bills (order_id, customer_name, customer_phone, items_json, subtotal, discount, total, payment_method, order_type, table_number, is_manual, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,'paid')`,
      [orderId, customer_name || 'Guest', customer_phone || '', JSON.stringify(items),
       subtotal, discount || 0, total, payment_method || 'Cash', order_type || 'dine_in', table_number || 0]
    );

    // Customer update
    if (customer_phone) {
      const existing = await client.query('SELECT * FROM customers WHERE phone = $1', [customer_phone]);
      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $1, last_order_at = NOW() WHERE phone = $2',
          [total, customer_phone]
        );
      } else {
        await client.query(
          'INSERT INTO customers (name, phone, address, total_orders, total_spent, last_order_at) VALUES ($1,$2,$3,1,$4,NOW())',
          [customer_name || 'Guest', customer_phone, customer_address || '', total]
        );
      }
      await updateCustomerCategory(client, customer_phone);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: order_type === 'takeaway'
        ? '🎉 Order place ho gaya! 15 minutes mein ready hoga. Aake le jaana!'
        : order_type === 'dine_in'
        ? `🎉 Order place ho gaya! Table #${table_number} pe serve kiya jaayega!`
        : '🎉 Order place ho gaya! 25-35 min mein aayega.',
      order_id: orderId,
      estimated_time: order_type === 'takeaway' ? '15 minutes' : '25-35 minutes'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: 'Order place karne mein error aaya' });
  } finally {
    client.release();
  }
});

async function updateCustomerCategory(client, phone) {
  try {
    const result = await client.query('SELECT * FROM customers WHERE phone = $1', [phone]);
    const customer = result.rows[0];
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
    await client.query('UPDATE customers SET category = $1 WHERE phone = $2', [category, phone]);
  } catch (err) {
    console.error('Category update error:', err);
  }
}

app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const ordersWithItems = result.rows.map(order => ({
      ...order,
      items: JSON.parse(order.items_json || '[]')
    }));
    res.json({ success: true, data: ordersWithItems });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders fetch karne mein error' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (order.rows.length === 0) return res.status(404).json({ success: false, message: 'Order nahi mila' });
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    res.json({ success: true, data: { ...order.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error aaya' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true, message: `Order status updated: ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Status update mein error' });
  }
});

// ============================
//  UPSELL ROUTES
// ============================
app.get('/api/upsell', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM upsell_items WHERE is_active = 1 ORDER BY sort_order ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/admin/upsell', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM upsell_items ORDER BY sort_order ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/admin/upsell', async (req, res) => {
  try {
    const { name, emoji, original_price, offer_price, offer_text, sort_order } = req.body;
    if (!name || !offer_price) return res.status(400).json({ success: false, message: 'Naam aur price zaroori hai!' });
    await pool.query('INSERT INTO upsell_items (name, emoji, original_price, offer_price, offer_text, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
      [name, emoji || '🍽️', original_price || 0, offer_price, offer_text || '', sort_order || 0]);
    res.json({ success: true, message: 'Upsell item add ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/admin/upsell/:id', async (req, res) => {
  try {
    const { name, emoji, original_price, offer_price, offer_text, is_active, sort_order } = req.body;
    await pool.query('UPDATE upsell_items SET name=$1, emoji=$2, original_price=$3, offer_price=$4, offer_text=$5, is_active=$6, sort_order=$7 WHERE id=$8',
      [name, emoji, original_price, offer_price, offer_text, is_active, sort_order, req.params.id]);
    res.json({ success: true, message: 'Updated!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.delete('/api/admin/upsell/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM upsell_items WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Delete ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  BILLING ROUTES
// ============================
app.get('/api/bills', async (req, res) => {
  try {
    const { date, from, to } = req.query;
    let result;
    if (date) {
      result = await pool.query("SELECT * FROM bills WHERE DATE(created_at) = $1 ORDER BY created_at DESC", [date]);
    } else if (from && to) {
      result = await pool.query("SELECT * FROM bills WHERE DATE(created_at) BETWEEN $1 AND $2 ORDER BY created_at DESC", [from, to]);
    } else {
      result = await pool.query("SELECT * FROM bills ORDER BY created_at DESC LIMIT 100");
    }
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/bills/manual', async (req, res) => {
  try {
    const { customer_name, customer_phone, items, subtotal, discount, total, payment_method, order_type, table_number } = req.body;
    const result = await pool.query(
      "INSERT INTO bills (customer_name, customer_phone, items_json, subtotal, discount, total, payment_method, order_type, table_number, is_manual, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,'paid') RETURNING id",
      [customer_name || 'Walk-in Customer', customer_phone || '', JSON.stringify(items || []),
       subtotal || 0, discount || 0, total || 0, payment_method || 'Cash', order_type || 'dine_in', table_number || 0]
    );
    res.json({ success: true, message: 'Bill create ho gaya!', id: result.rows[0].id });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/bills/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Bill nahi mila' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  COUPON ROUTES
// ============================
app.get('/api/coupons', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Coupons fetch error' }); }
});

app.post('/api/coupons', async (req, res) => {
  try {
    const { code, type, amount, min_order, max_uses, valid_till } = req.body;
    await pool.query('INSERT INTO coupons (code, type, amount, min_order, max_uses, valid_till) VALUES ($1,$2,$3,$4,$5,$6)',
      [code.toUpperCase(), type || 'flat', amount, min_order || 0, max_uses || 1, valid_till || '']);
    res.json({ success: true, message: 'Coupon ban gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Coupon create error' }); }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, order_total } = req.body;
    const result = await pool.query('SELECT * FROM coupons WHERE code = $1 AND is_active = 1', [code.toUpperCase()]);
    const coupon = result.rows[0];
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon nahi mila ya expired hai!' });
    if (coupon.used_count >= coupon.max_uses) return res.status(400).json({ success: false, message: 'Coupon limit khatam ho gayi!' });
    if (coupon.min_order > 0 && order_total < coupon.min_order) return res.status(400).json({ success: false, message: `Minimum order ₹${coupon.min_order} hona chahiye!` });
    if (coupon.valid_till && new Date(coupon.valid_till) < new Date()) return res.status(400).json({ success: false, message: 'Coupon expire ho gaya!' });
    let discount = coupon.amount;
    if (coupon.type === 'percent') discount = Math.floor((order_total * coupon.amount) / 100);
    res.json({ success: true, discount, message: `🎉 ₹${discount} discount mila!` });
  } catch (err) { res.status(500).json({ success: false, message: 'Coupon validate error' }); }
});

app.delete('/api/coupons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM coupons WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Coupon delete ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Delete error' }); }
});

// ============================
//  CUSTOMER ROUTES
// ============================
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY total_spent DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Customers fetch error' }); }
});

app.get('/api/customers/phone/:phone', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE phone = $1', [req.params.phone]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer nahi mila' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { name, address, dob, gender, level, tags } = req.body;
    await pool.query('UPDATE customers SET name=$1, address=$2, dob=$3, gender=$4, level=$5, tags=$6 WHERE id=$7',
      [name, address, dob, gender, level || '', tags || '', req.params.id]);
    res.json({ success: true, message: 'Customer update ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Update error' }); }
});

app.put('/api/customers/payment/:phone', async (req, res) => {
  try {
    const { upi_id, bank_account, bank_ifsc, bank_holder } = req.body;
    await pool.query('UPDATE customers SET upi_id=$1, bank_account=$2, bank_ifsc=$3, bank_holder=$4 WHERE phone=$5',
      [upi_id || '', bank_account || '', bank_ifsc || '', bank_holder || '', req.params.phone]);
    res.json({ success: true, message: 'Payment info save ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  REWARD ROUTES
// ============================
app.get('/api/rewards/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reward_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Settings fetch error' }); }
});

app.put('/api/rewards/settings', async (req, res) => {
  try {
    const { is_active, points_per_order, point_value, validity_days } = req.body;
    await pool.query('UPDATE reward_settings SET is_active=$1, points_per_order=$2, point_value=$3, validity_days=$4 WHERE id=1',
      [is_active, points_per_order, point_value, validity_days]);
    res.json({ success: true, message: 'Reward settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Settings update error' }); }
});

app.post('/api/rewards/add', async (req, res) => {
  try {
    const { customer_phone, points, reason } = req.body;
    await pool.query('INSERT INTO rewards (customer_phone, points, reason) VALUES ($1,$2,$3)', [customer_phone, points, reason || 'Admin ne add kiya']);
    await pool.query('UPDATE customers SET reward_points = reward_points + $1 WHERE phone = $2', [points, customer_phone]);
    res.json({ success: true, message: `${points} points add ho gaye!` });
  } catch (err) { res.status(500).json({ success: false, message: 'Reward add error' }); }
});

// ============================
//  SALES ROUTES
// ============================
app.get('/api/sales/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query("SELECT * FROM orders WHERE DATE(created_at) = $1 AND status != 'cancelled'", [today]);
    const totalSale = result.rows.reduce((sum, o) => sum + o.total, 0);
    res.json({ success: true, data: { totalSale, totalOrders: result.rows.length, orders: result.rows } });
  } catch (err) { res.status(500).json({ success: false, message: 'Sales fetch error' }); }
});

app.get('/api/sales/history', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as total_orders, SUM(total) as total_sale
      FROM orders WHERE status != 'cancelled'
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'History fetch error' }); }
});

// ============================
//  DELIVERY SETTINGS
// ============================
app.get('/api/delivery/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM delivery_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Delivery settings fetch error' }); }
});

app.put('/api/delivery/settings', async (req, res) => {
  try {
    const { base_charge, per_km_charge, free_delivery_above } = req.body;
    await pool.query('UPDATE delivery_settings SET base_charge=$1, per_km_charge=$2, free_delivery_above=$3 WHERE id=1',
      [base_charge, per_km_charge, free_delivery_above]);
    res.json({ success: true, message: 'Delivery settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Settings update error' }); }
});

// ============================
//  WISHLIST ROUTES
// ============================
app.post('/api/wishlist/add', async (req, res) => {
  try {
    const { customer_phone, item_id, item_name, item_price, item_emoji } = req.body;
    const existing = await pool.query('SELECT * FROM wishlists WHERE customer_phone = $1 AND item_id = $2', [customer_phone, item_id]);
    if (existing.rows.length > 0) return res.json({ success: false, message: 'Already wishlist mein hai!' });
    await pool.query('INSERT INTO wishlists (customer_phone, item_id, item_name, item_price, item_emoji) VALUES ($1,$2,$3,$4,$5)',
      [customer_phone, item_id, item_name, item_price, item_emoji || '🍽️']);
    res.json({ success: true, message: 'Wishlist mein add ho gaya! ❤️' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/wishlist/:phone', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wishlists WHERE customer_phone = $1 ORDER BY added_at DESC', [req.params.phone]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.delete('/api/wishlist/:phone/:item_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM wishlists WHERE customer_phone = $1 AND item_id = $2', [req.params.phone, req.params.item_id]);
    res.json({ success: true, message: 'Wishlist se remove ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/admin/wishlists', async (req, res) => {
  try {
    const result = await pool.query('SELECT w.*, c.name as customer_name FROM wishlists w LEFT JOIN customers c ON w.customer_phone = c.phone ORDER BY w.added_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  REFERRAL ROUTES
// ============================
app.get('/api/referral/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM referral_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/referral/settings', async (req, res) => {
  try {
    const { is_active, reward_type, reward_amount, is_lifetime, lifetime_percent, max_limit } = req.body;
    await pool.query('UPDATE referral_settings SET is_active=$1, reward_type=$2, reward_amount=$3, is_lifetime=$4, lifetime_percent=$5, max_limit=$6 WHERE id=1',
      [is_active, reward_type, reward_amount, is_lifetime, lifetime_percent, max_limit]);
    res.json({ success: true, message: 'Referral settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/referral/apply', async (req, res) => {
  try {
    const { referrer_phone, referred_phone, referred_name } = req.body;
    if (referrer_phone === referred_phone) return res.status(400).json({ success: false, message: 'Apne aap ko refer nahi kar sakte!' });
    const existing = await pool.query('SELECT * FROM referrals WHERE referred_phone = $1', [referred_phone]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'Yeh number pehle se refer ho chuka hai!' });
    const settings = await pool.query('SELECT * FROM referral_settings WHERE id = 1');
    const s = settings.rows[0];
    await pool.query("INSERT INTO referrals (referrer_phone, referred_phone, referred_name, reward_type, reward_amount, is_lifetime, status) VALUES ($1,$2,$3,$4,$5,$6,'active')",
      [referrer_phone, referred_phone, referred_name || '', s.reward_type, s.reward_amount, s.is_lifetime]);
    await pool.query("INSERT INTO wallet_transactions (customer_phone, coins, type, reason) VALUES ($1,$2,'credit','Referral Bonus')", [referrer_phone, s.reward_amount]);
    await pool.query('UPDATE customers SET reward_points = reward_points + $1 WHERE phone = $2', [s.reward_amount, referrer_phone]);
    res.json({ success: true, message: `Referral applied! ${s.reward_amount} coins mile! 🎉` });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/referral/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM referrals ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/referral/history/:phone', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM referrals WHERE referrer_phone = $1 ORDER BY created_at DESC', [req.params.phone]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  LEADERBOARD ROUTES
// ============================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leaderboard WHERE is_visible = 1 ORDER BY rank ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leaderboard ORDER BY rank ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/admin/leaderboard', async (req, res) => {
  try {
    const { rank, display_name, tag, orders, total_spent, is_manual, is_visible } = req.body;
    await pool.query('INSERT INTO leaderboard (rank, display_name, tag, orders, total_spent, is_manual, is_visible) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [rank, display_name, tag, orders || 0, total_spent || 0, is_manual || 1, is_visible ?? 1]);
    res.json({ success: true, message: 'Entry add ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/admin/leaderboard/:id', async (req, res) => {
  try {
    const { rank, display_name, tag, orders, total_spent, is_visible } = req.body;
    await pool.query('UPDATE leaderboard SET rank=$1, display_name=$2, tag=$3, orders=$4, total_spent=$5, is_visible=$6 WHERE id=$7',
      [rank, display_name, tag, orders, total_spent, is_visible, req.params.id]);
    res.json({ success: true, message: 'Updated!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.delete('/api/admin/leaderboard/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Delete ho gaya!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  FREE ITEM ROUTES
// ============================
app.get('/api/free-item/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM free_item_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.put('/api/free-item/settings', async (req, res) => {
  try {
    const { is_active, task_type, target_count, reward_item } = req.body;
    await pool.query('UPDATE free_item_settings SET is_active=$1, task_type=$2, target_count=$3, reward_item=$4 WHERE id=1',
      [is_active, task_type, target_count, reward_item]);
    res.json({ success: true, message: 'Free item settings save ho gayi!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/free-item/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM free_item_tasks ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.get('/api/free-item/progress/:phone', async (req, res) => {
  try {
    const settings = await pool.query('SELECT * FROM free_item_settings WHERE id = 1');
    const s = settings.rows[0];
    let task = await pool.query("SELECT * FROM free_item_tasks WHERE customer_phone = $1 AND status = 'in_progress'", [req.params.phone]);
    if (task.rows.length === 0) {
      await pool.query('INSERT INTO free_item_tasks (customer_phone, task_type, target_count, reward_item) VALUES ($1,$2,$3,$4)',
        [req.params.phone, s.task_type, s.target_count, s.reward_item]);
      task = await pool.query("SELECT * FROM free_item_tasks WHERE customer_phone = $1 AND status = 'in_progress'", [req.params.phone]);
    }
    res.json({ success: true, data: task.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  WALLET ROUTES
// ============================
app.get('/api/wallet/:phone', async (req, res) => {
  try {
    const customer = await pool.query('SELECT reward_points FROM customers WHERE phone = $1', [req.params.phone]);
    const history = await pool.query('SELECT * FROM wallet_transactions WHERE customer_phone = $1 ORDER BY created_at DESC LIMIT 20', [req.params.phone]);
    res.json({ success: true, data: { balance: customer.rows[0] ? customer.rows[0].reward_points : 0, history: history.rows } });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

// ============================
//  ANALYTICS ROUTES
// ============================
app.get('/api/analytics', async (req, res) => {
  try {
    const { range, from, to } = req.query;

    let dateFilter = '';
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (range === 'today') dateFilter = `AND DATE(created_at) = '${today}'`;
    else if (range === 'yesterday') dateFilter = `AND DATE(created_at) = '${yesterday}'`;
    else if (range === '7days') dateFilter = `AND created_at >= NOW() - INTERVAL '7 days'`;
    else if (range === '15days') dateFilter = `AND created_at >= NOW() - INTERVAL '15 days'`;
    else if (range === '30days') dateFilter = `AND created_at >= NOW() - INTERVAL '30 days'`;
    else if (range === 'custom' && from && to) dateFilter = `AND DATE(created_at) BETWEEN '${from}' AND '${to}'`;
    else dateFilter = `AND created_at >= NOW() - INTERVAL '7 days'`;

    const bestSelling = await pool.query('SELECT item_name, SUM(quantity) as total_qty FROM order_items GROUP BY item_name ORDER BY total_qty DESC LIMIT 10');
    const peakHours = await pool.query("SELECT TO_CHAR(created_at, 'HH24') as hour, COUNT(*) as count FROM orders GROUP BY hour ORDER BY count DESC LIMIT 5");
    const repeatCustomers = await pool.query('SELECT COUNT(*) as count FROM customers WHERE total_orders > 1');
    const totalCustomers = await pool.query('SELECT COUNT(*) as count FROM customers');
    const couponPerf = await pool.query("SELECT coupon_code, COUNT(*) as used_times, SUM(discount) as total_discount FROM orders WHERE coupon_code != '' GROUP BY coupon_code");
    const dailyRevenue = await pool.query(`SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders FROM orders WHERE status != 'cancelled' ${dateFilter} GROUP BY DATE(created_at) ORDER BY date ASC`);
    const last7 = await pool.query(`SELECT SUM(total) as revenue FROM orders WHERE status != 'cancelled' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC`);
    const orderTypeBreakdown = await pool.query("SELECT order_type, COUNT(*) as count, SUM(total) as revenue FROM orders WHERE status != 'cancelled' GROUP BY order_type");

    let predictedTomorrow = 0, predictionConfidence = 'Low';
    const last7rows = last7.rows;
    if (last7rows.length > 0) {
      const avg = last7rows.reduce((s, d) => s + parseFloat(d.revenue || 0), 0) / last7rows.length;
      if (last7rows.length >= 3) {
        const recent = last7rows.slice(-3).reduce((s, d) => s + parseFloat(d.revenue || 0), 0) / 3;
        predictedTomorrow = Math.round((avg * 0.4) + (recent * 0.6));
        predictionConfidence = last7rows.length >= 5 ? 'High' : 'Medium';
      } else {
        predictedTomorrow = Math.round(avg);
      }
    }

    res.json({
      success: true,
      data: {
        bestSelling: bestSelling.rows,
        peakHours: peakHours.rows,
        repeatCustomers: parseInt(repeatCustomers.rows[0].count),
        totalCustomers: parseInt(totalCustomers.rows[0].count),
        couponPerf: couponPerf.rows,
        dailyRevenue: dailyRevenue.rows,
        predictedTomorrow,
        predictionConfidence,
        orderTypeBreakdown: orderTypeBreakdown.rows
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'Analytics error' });
  }
});

// ============================
//  TODAY SPECIAL ROUTES
// ============================
app.get('/api/today-special', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM today_special WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
});

app.post('/api/today-special', async (req, res) => {
  try {
    const { item_name, description, price, old_price, emoji } = req.body;
    await pool.query('UPDATE today_special SET is_active = 0');
    await pool.query('INSERT INTO today_special (item_name, description, price, old_price, emoji, is_active) VALUES ($1,$2,$3,$4,$5,1)',
      [item_name, description || '', price, old_price || 0, emoji || '🍽️']);
    res.json({ success: true, message: "Today's special set ho gaya!" });
  } catch (err) { res.status(500).json({ success: false, message: 'Error aaya' }); }
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
