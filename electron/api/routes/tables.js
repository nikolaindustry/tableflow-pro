import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/tables/floors?restaurant_id=xxx
router.get('/floors', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

    const floors = db.prepare('SELECT * FROM floors WHERE restaurant_id = ? ORDER BY floor_number ASC').all(restaurant_id);
    const tables = db.prepare(`
      SELECT t.* FROM tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE f.restaurant_id = ?
    `).all(restaurant_id);

    // Group tables by floor
    const tablesByFloor = {};
    tables.forEach(t => {
      if (!tablesByFloor[t.floor_id]) tablesByFloor[t.floor_id] = [];
      tablesByFloor[t.floor_id].push({ ...t, is_occupied: !!t.is_occupied });
    });

    const result = floors.map(f => ({
      ...f,
      tables: tablesByFloor[f.id] || []
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tables?restaurant_id=xxx (flat list with floor info)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

    const tables = db.prepare(`
      SELECT t.id, t.table_number, t.capacity, t.is_occupied, f.name as floor_name, f.restaurant_id
      FROM tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE f.restaurant_id = ?
    `).all(restaurant_id);

    const result = tables.map(t => ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      is_occupied: !!t.is_occupied,
      floor: { name: t.floor_name, restaurant_id: t.restaurant_id }
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tables/floors
router.post('/floors', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, name, floor_number } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO floors (id, restaurant_id, name, floor_number) VALUES (?, ?, ?, ?)').run(
      id, restaurant_id, name, floor_number || 0
    );
    const floor = db.prepare('SELECT * FROM floors WHERE id = ?').get(id);
    broadcast('table_change', { type: 'INSERT', table: 'floors', record: floor });
    res.json(floor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tables/floors/:id
router.put('/floors/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, floor_number } = req.body;
    db.prepare(`UPDATE floors SET name = ?, floor_number = ?, sync_status = 'pending' WHERE id = ?`).run(
      name, floor_number, req.params.id
    );
    const floor = db.prepare('SELECT * FROM floors WHERE id = ?').get(req.params.id);
    broadcast('table_change', { type: 'UPDATE', table: 'floors', record: floor });
    res.json(floor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tables/floors/:id
router.delete('/floors/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM tables WHERE floor_id = ?').run(req.params.id);
    db.prepare('DELETE FROM floors WHERE id = ?').run(req.params.id);
    broadcast('table_change', { type: 'DELETE', table: 'floors', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tables
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { floor_id, table_number, capacity } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO tables (id, floor_id, table_number, capacity) VALUES (?, ?, ?, ?)').run(
      id, floor_id, table_number, capacity || 4
    );
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
    broadcast('table_change', { type: 'INSERT', table: 'tables', record: table });
    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tables/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { table_number, capacity, is_occupied } = req.body;
    const updates = [];
    const params = [];
    if (table_number !== undefined) { updates.push('table_number = ?'); params.push(table_number); }
    if (capacity !== undefined) { updates.push('capacity = ?'); params.push(capacity); }
    if (is_occupied !== undefined) { updates.push('is_occupied = ?'); params.push(is_occupied ? 1 : 0); }
    updates.push("sync_status = 'pending'");
    params.push(req.params.id);

    db.prepare(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    broadcast('table_change', { type: 'UPDATE', table: 'tables', record: table });
    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tables/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM tables WHERE id = ?').run(req.params.id);
    broadcast('table_change', { type: 'DELETE', table: 'tables', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
