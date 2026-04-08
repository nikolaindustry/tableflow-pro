import { Router } from 'express';
import { getDb, generateId } from '../database/db.js';
import crypto from 'crypto';

const router = Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM local_users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const id = generateId();
    db.prepare('INSERT INTO local_users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)').run(
      id, email.toLowerCase(), hashPassword(password), full_name || null
    );

    // Auto-create profile
    db.prepare('INSERT OR IGNORE INTO profiles (id, user_id, full_name) VALUES (?, ?, ?)').run(
      generateId(), id, full_name || null
    );

    res.json({
      user: { id, email: email.toLowerCase(), full_name },
      session: { access_token: id, user: { id, email: email.toLowerCase() } }
    });
  } catch (err) {
    console.error('[Auth] Signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/signin
router.post('/signin', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM local_users WHERE email = ?').get(email.toLowerCase());
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      user: { id: user.id, email: user.email, full_name: user.full_name },
      session: { access_token: user.id, user: { id: user.id, email: user.email } }
    });
  } catch (err) {
    console.error('[Auth] Signin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/session
router.get('/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.json({ user: null, session: null });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM local_users WHERE id = ?').get(token);
  if (!user) {
    return res.json({ user: null, session: null });
  }

  res.json({
    user: { id: user.id, email: user.email, full_name: user.full_name },
    session: { access_token: user.id, user: { id: user.id, email: user.email } }
  });
});

// POST /api/auth/signout
router.post('/signout', (req, res) => {
  res.json({ success: true });
});

export default router;
