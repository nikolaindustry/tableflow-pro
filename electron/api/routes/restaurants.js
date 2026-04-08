import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import { broadcast } from '../sse.js';

const router = Router();

// GET /api/restaurants
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json([]);

    const owned = db.prepare('SELECT * FROM restaurants WHERE owner_id = ? ORDER BY created_at DESC').all(userId);
    res.json(owned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/restaurants/staff
router.get('/staff', (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json([]);

    const staffRecords = db.prepare(`
      SELECT sm.role, r.id, r.name, r.slug, r.address, r.phone, r.gstin, r.created_at, r.owner_id
      FROM staff_members sm
      JOIN restaurants r ON sm.restaurant_id = r.id
      WHERE sm.user_id = ? AND sm.is_active = 1
    `).all(userId);

    const result = staffRecords.map(s => ({
      role: s.role,
      restaurants: {
        id: s.id, name: s.name, slug: s.slug, address: s.address,
        phone: s.phone, gstin: s.gstin, created_at: s.created_at, owner_id: s.owner_id
      }
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/restaurants
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, address, phone, gstin, owner_id } = req.body;
    const id = generateId();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + id.substring(0, 6);

    db.prepare(`INSERT INTO restaurants (id, name, slug, address, phone, gstin, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, name, slug, address || null, phone || null, gstin || null, owner_id
    );

    // Auto-create owner as staff member
    db.prepare(`INSERT INTO staff_members (id, restaurant_id, user_id, email, full_name, role, is_active, joined_at) VALUES (?, ?, ?, ?, ?, 'owner', 1, datetime('now'))`).run(
      generateId(), id, owner_id,
      db.prepare('SELECT email FROM local_users WHERE id = ?').get(owner_id)?.email || 'owner@local',
      db.prepare('SELECT full_name FROM local_users WHERE id = ?').get(owner_id)?.full_name || 'Owner'
    );

    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
    broadcast('restaurant_change', { type: 'INSERT', record: restaurant });
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/restaurants/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, address, phone, gstin } = req.body;
    db.prepare(`UPDATE restaurants SET name = COALESCE(?, name), address = ?, phone = ?, gstin = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?`).run(
      name, address, phone, gstin, req.params.id
    );
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
    broadcast('restaurant_change', { type: 'UPDATE', record: restaurant });
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Link unlinked staff
router.post('/link-staff', (req, res) => {
  try {
    const db = getDb();
    const { email, user_id } = req.body;
    const result = db.prepare(`UPDATE staff_members SET user_id = ?, joined_at = datetime('now') WHERE email = ? AND user_id IS NULL`).run(user_id, email);
    res.json({ linked: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
