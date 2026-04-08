import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';

const router = Router();

// GET /api/expenses?restaurant_id=xxx
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    const expenses = db.prepare(`
      SELECT e.*, ec.name as category_name, s.name as supplier_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN suppliers s ON e.supplier_id = s.id
      WHERE e.restaurant_id = ? ORDER BY e.expense_date DESC
    `).all(restaurant_id);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, category_id, supplier_id, amount, description, expense_date, payment_method } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO expenses (id, restaurant_id, category_id, supplier_id, amount, description, expense_date, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, restaurant_id, category_id || null, supplier_id || null, amount, description || null, expense_date, payment_method || null
    );
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { category_id, supplier_id, amount, description, expense_date, payment_method } = req.body;
    db.prepare(`UPDATE expenses SET category_id = ?, supplier_id = ?, amount = ?, description = ?, expense_date = ?, payment_method = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?`).run(
      category_id || null, supplier_id || null, amount, description || null, expense_date, payment_method || null, req.params.id
    );
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', (req, res) => {
  try { getDb().prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Categories ---
router.get('/categories', (req, res) => {
  try {
    const { restaurant_id } = req.query;
    res.json(getDb().prepare('SELECT * FROM expense_categories WHERE restaurant_id = ?').all(restaurant_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, name, description } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO expense_categories (id, restaurant_id, name, description) VALUES (?, ?, ?, ?)').run(id, restaurant_id, name, description || null);
    res.json(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/categories/:id', (req, res) => {
  try { getDb().prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/categories/:id', (req, res) => {
  try {
    const { name, description } = req.body;
    getDb().prepare("UPDATE expense_categories SET name = ?, description = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?").run(
      name, description || null, req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Suppliers ---
router.get('/suppliers', (req, res) => {
  try {
    const { restaurant_id } = req.query;
    res.json(getDb().prepare('SELECT * FROM suppliers WHERE restaurant_id = ?').all(restaurant_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/suppliers', (req, res) => {
  try {
    const db = getDb();
    const { restaurant_id, name, contact_person, email, phone, address } = req.body;
    const id = generateId();
    db.prepare('INSERT INTO suppliers (id, restaurant_id, name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, restaurant_id, name, contact_person || null, email || null, phone || null, address || null
    );
    res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/suppliers/:id', (req, res) => {
  try { getDb().prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/suppliers/:id', (req, res) => {
  try {
    const { name, contact_person, email, phone, address } = req.body;
    getDb().prepare("UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE id = ?").run(
      name, contact_person || null, email || null, phone || null, address || null, req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
