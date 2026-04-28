const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// Helper to check if admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Super Admin access required' });
};

// GET /api/users - List all users (Admin only)
router.get('/', isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, email, role, created_at FROM users').all();
  res.json(users);
});

// POST /api/users - Create new user (Admin only)
router.post('/', isAdmin, async (req, res) => {
  const { username, password, role, email } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing fields' });

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    db.prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)').run(username, hash, role, email || null);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', isAdmin, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  if (user && user.username === 'admin') return res.status(400).json({ error: 'Cannot delete primary admin' });
  
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PUT /api/users/:id - Update user (Admin only)
router.put('/:id', isAdmin, async (req, res) => {
  const { username, role, email, password } = req.body;
  if (!username || !role) return res.status(400).json({ error: 'Username and role are required' });

  try {
    if (password) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      db.prepare('UPDATE users SET username = ?, role = ?, email = ?, password_hash = ? WHERE id = ?').run(username, role, email || null, hash, req.params.id);
    } else {
      db.prepare('UPDATE users SET username = ?, role = ?, email = ? WHERE id = ?').run(username, role, email || null, req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
