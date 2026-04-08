import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/staff?restaurant_id=xxx
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    const staff = db.prepare('SELECT * FROM staff_members WHERE restaurant_id = ? ORDER BY created_at DESC').all(restaurant_id);
    res.json(staff.map(s => ({ ...s, is_active: !!s.is_active })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, email, full_name, phone, role } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO staff_members (id, restaurant_id, email, full_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, restaurant_id, email, full_name, phone || null, role || 'waiter'
    );
    const s = db.prepare('SELECT * FROM staff_members WHERE id = ?').get(id);
    broadcast('staff_change', { type: 'INSERT', record: s });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/staff/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { email, full_name, phone, role, is_active } = req.body;
    db.prepare(`UPDATE staff_members SET email = ?, full_name = ?, phone = ?, role = ?, is_active = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?`).run(
      email, full_name, phone || null, role, is_active ? 1 : 0, req.params.id
    );
    const s = db.prepare('SELECT * FROM staff_members WHERE id = ?').get(req.params.id);
    broadcast('staff_change', { type: 'UPDATE', record: s });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM staff_members WHERE id = ?').run(req.params.id);
    broadcast('staff_change', { type: 'DELETE', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Shifts ---
// GET /api/staff/shifts?restaurant_id=xxx
router.get('/shifts', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    const shifts = db.prepare(`
      SELECT s.*, sm.full_name as staff_name FROM shifts s
      JOIN staff_members sm ON s.staff_member_id = sm.id
      WHERE s.restaurant_id = ? ORDER BY s.shift_date DESC, s.start_time ASC
    `).all(restaurant_id);
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff/shifts
router.post('/shifts', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, staff_member_id, shift_date, start_time, end_time, notes } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO shifts (id, restaurant_id, staff_member_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, restaurant_id, staff_member_id, shift_date, start_time, end_time, notes || null
    );
    res.json(db.prepare('SELECT * FROM shifts WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/shifts/:id
router.delete('/shifts/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
