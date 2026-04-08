import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/menu/categories?restaurant_id=xxx
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

    const categories = db.prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order ASC').all(restaurant_id);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/menu/categories
router.post('/categories', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, name, description, is_active, sort_order } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, description, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, restaurant_id, name, description || null, is_active !== false ? 1 : 0, sort_order || 0
    );
    const cat = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(id);
    broadcast('menu_change', { type: 'INSERT', table: 'menu_categories', record: cat });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, description, is_active } = req.body;
    db.prepare(`UPDATE menu_categories SET name = ?, description = ?, is_active = ?, sync_status = 'pending' WHERE id = ?`).run(
      name, description || null, is_active ? 1 : 0, req.params.id
    );
    const cat = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(req.params.id);
    broadcast('menu_change', { type: 'UPDATE', table: 'menu_categories', record: cat });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM menu_items WHERE category_id = ?').run(req.params.id);
    db.prepare('DELETE FROM menu_categories WHERE id = ?').run(req.params.id);
    broadcast('menu_change', { type: 'DELETE', table: 'menu_categories', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/menu/items?restaurant_id=xxx&available=true
router.get('/items', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, available } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

    let sql = `
      SELECT mi.*, mc.name as category_name, mc.restaurant_id
      FROM menu_items mi
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mc.restaurant_id = ?
    `;
    const params = [restaurant_id];

    if (available === 'true') {
      sql += ' AND mi.is_available = 1';
    }

    sql += ' ORDER BY mc.sort_order ASC, mi.name ASC';
    const items = db.prepare(sql).all(...params);

    // Format to match Supabase response shape
    const result = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      food_type: item.food_type,
      spice_level: item.spice_level,
      preparation_time: item.preparation_time,
      is_available: !!item.is_available,
      image_url: item.image_url,
      category_id: item.category_id,
      kitchen_id: item.kitchen_id,
      created_at: item.created_at,
      category: { name: item.category_name, restaurant_id: item.restaurant_id }
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/menu/items
router.post('/items', (req, res) => {
  try {
    const db = getDb();
    const { name, description, price, food_type, spice_level, preparation_time, is_available, category_id, kitchen_id } = req.body;
    const id = generateId();
    db.prepare(`INSERT INTO menu_items (id, category_id, kitchen_id, name, description, price, food_type, spice_level, preparation_time, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, category_id, kitchen_id || null, name, description || null, price, food_type || 'veg', spice_level || null, preparation_time || null, is_available !== false ? 1 : 0
    );
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    broadcast('menu_change', { type: 'INSERT', table: 'menu_items', record: item });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/menu/items/:id
router.put('/items/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, description, price, food_type, spice_level, preparation_time, is_available, category_id, kitchen_id } = req.body;
    db.prepare(`UPDATE menu_items SET name = ?, description = ?, price = ?, food_type = ?, spice_level = ?, preparation_time = ?, is_available = ?, category_id = ?, kitchen_id = ?, sync_status = 'pending' WHERE id = ?`).run(
      name, description || null, price, food_type, spice_level || null, preparation_time || null, is_available ? 1 : 0, category_id, kitchen_id || null, req.params.id
    );
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    broadcast('menu_change', { type: 'UPDATE', table: 'menu_items', record: item });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/menu/items/:id
router.delete('/items/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
    broadcast('menu_change', { type: 'DELETE', table: 'menu_items', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
