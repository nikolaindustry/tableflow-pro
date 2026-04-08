import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/kitchens?restaurant_id=xxx
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, active } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    let sql = 'SELECT * FROM kitchens WHERE restaurant_id = ?';
    const params = [restaurant_id];
    if (active === 'true') { sql += ' AND is_active = 1'; }
    const kitchens = db.prepare(sql).all(...params);
    res.json(kitchens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kitchens
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, name, description } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO kitchens (id, restaurant_id, name, description) VALUES (?, ?, ?, ?)').run(id, restaurant_id, name, description || null);
    const k = db.prepare('SELECT * FROM kitchens WHERE id = ?').get(id);
    broadcast('kitchen_change', { type: 'INSERT', record: k });
    res.json(k);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/kitchens/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, description, is_active } = req.body;
    db.prepare(`UPDATE kitchens SET name = ?, description = ?, is_active = ?, sync_status = 'pending' WHERE id = ?`).run(
      name, description || null, is_active ? 1 : 0, req.params.id
    );
    const k = db.prepare('SELECT * FROM kitchens WHERE id = ?').get(req.params.id);
    broadcast('kitchen_change', { type: 'UPDATE', record: k });
    res.json(k);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/kitchens/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM kitchens WHERE id = ?').run(req.params.id);
    broadcast('kitchen_change', { type: 'DELETE', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
