import { Router } from 'express';
import { getDb, generateId, runTransaction } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/orders?restaurant_id=xxx&status=pending,cooking,ready
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, status } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

    let orderSql = `SELECT * FROM orders WHERE restaurant_id = ?`;
    const params = [restaurant_id];

    if (status) {
      const statuses = status.split(',');
      orderSql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    orderSql += ` ORDER BY created_at DESC`;
    const orders = db.prepare(orderSql).all(...params);

    // Batch load related data for all orders at once
    if (orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');

    // Load all order items
    const items = db.prepare(`
      SELECT oi.*, mi.name as menu_item_name, mi.food_type as menu_item_food_type, mi.preparation_time as menu_item_prep_time
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id IN (${placeholders})
    `).all(...orderIds);

    // Load table info
    const tableIds = [...new Set(orders.filter(o => o.table_id).map(o => o.table_id))];
    let tableMap = {};
    if (tableIds.length > 0) {
      const tPlaceholders = tableIds.map(() => '?').join(',');
      const tables = db.prepare(`
        SELECT t.*, f.name as floor_name FROM tables t
        JOIN floors f ON t.floor_id = f.id
        WHERE t.id IN (${tPlaceholders})
      `).all(...tableIds);
      tables.forEach(t => { tableMap[t.id] = t; });
    }

    // Group items by order
    const itemsByOrder = {};
    items.forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        status: item.status,
        notes: item.notes,
        kitchen_id: item.kitchen_id,
        created_at: item.created_at,
        updated_at: item.updated_at,
        order_id: item.order_id,
        menu_item: item.menu_item_id ? {
          name: item.menu_item_name,
          food_type: item.menu_item_food_type,
          preparation_time: item.menu_item_prep_time
        } : null
      });
    });

    // Assemble response
    const result = orders.map(order => {
      const table = order.table_id ? tableMap[order.table_id] : null;
      return {
        ...order,
        table: table ? {
          table_number: table.table_number,
          floor: { name: table.floor_name }
        } : null,
        order_items: itemsByOrder[order.id] || []
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[Orders] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders - Create order with items (atomic transaction)
router.post('/', (req, res) => {
  try {
    const { restaurant_id, table_id, total_amount, notes, items } = req.body;
    if (!restaurant_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'restaurant_id and items required' });
    }

    const result = runTransaction(() => {
      const db = getDb();
      const orderId = generateId();

      // Insert order
      db.prepare(`INSERT INTO orders (id, restaurant_id, table_id, total_amount, notes, status) VALUES (?, ?, ?, ?, ?, 'pending')`).run(
        orderId, restaurant_id, table_id || null, total_amount || 0, notes || null
      );

      // Insert all items (prepared statement reuse)
      const insertItem = db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, kitchen_id, quantity, unit_price, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`);
      for (const item of items) {
        insertItem.run(generateId(), orderId, item.menu_item_id, item.kitchen_id || null, item.quantity, item.unit_price);
      }

      // Mark table as occupied
      if (table_id) {
        db.prepare('UPDATE tables SET is_occupied = 1 WHERE id = ?').run(table_id);
      }

      return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    });

    broadcast('order_change', { type: 'INSERT', record: result });
    res.json(result);
  } catch (err) {
    console.error('[Orders] POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id - Update order status
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const { status, payment_method } = req.body;
    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (payment_method) { updates.push('payment_method = ?'); params.push(payment_method); }
    updates.push("updated_at = datetime('now')");
    updates.push("sync_status = 'pending'");

    params.push(req.params.id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Free table on served/cancelled
    if (status === 'served' || status === 'cancelled') {
      const order = db.prepare('SELECT table_id FROM orders WHERE id = ?').get(req.params.id);
      if (order?.table_id) {
        db.prepare('UPDATE tables SET is_occupied = 0 WHERE id = ?').run(order.table_id);
      }
    }

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    broadcast('order_change', { type: 'UPDATE', record: updated });
    res.json(updated);
  } catch (err) {
    console.error('[Orders] PATCH error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/items/:id - Update order item status
router.patch('/items/:id', (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;

    db.prepare(`UPDATE order_items SET status = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?`).run(status, req.params.id);

    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.id);

    // Check if all items in order are ready -> auto-advance order
    if (status === 'ready' && item) {
      const allReady = db.prepare(`SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND status != 'ready'`).get(item.order_id);
      if (allReady.cnt === 0) {
        db.prepare(`UPDATE orders SET status = 'ready', updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?`).run(item.order_id);
        broadcast('order_change', { type: 'UPDATE', record: db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id) });
      }
    }

    // Bulk update: when order moves to cooking, update pending items
    broadcast('order_items_change', { type: 'UPDATE', record: item });
    res.json(item);
  } catch (err) {
    console.error('[OrderItems] PATCH error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/items-bulk - Bulk update items by status
router.patch('/:id/items-bulk', (req, res) => {
  try {
    const db = getDb();
    const { from_status, to_status } = req.body;
    const orderId = req.params.id;

    db.prepare(`UPDATE order_items SET status = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE order_id = ? AND status = ?`).run(
      to_status, orderId, from_status
    );

    broadcast('order_items_change', { type: 'BULK_UPDATE', order_id: orderId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT table_id FROM orders WHERE id = ?').get(req.params.id);
    if (order?.table_id) {
      db.prepare('UPDATE tables SET is_occupied = 0 WHERE id = ?').run(order.table_id);
    }
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    broadcast('order_change', { type: 'DELETE', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
