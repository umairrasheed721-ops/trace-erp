const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// Helper to check if admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Super Admin access required' });
};

// ─── STATIC ROUTES FIRST (must come before /:id to avoid Express matching "permissions" as an ID) ───

// GET /api/users/permissions - Get all role permissions (public, used by sidebar)
router.get('/permissions', (req, res) => {
  try {
    const permissions = db.prepare('SELECT * FROM role_permissions').all();
    res.json(permissions);
  } catch (err) {
    console.error('GET permissions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/permissions - Overwrite permissions for a role (admin only)
router.post('/permissions', isAdmin, (req, res) => {
  const { role_name, page_ids } = req.body;
  if (!role_name || !Array.isArray(page_ids)) {
    return res.status(400).json({ error: 'Invalid data: role_name and page_ids[] required' });
  }

  try {
    // Use raw exec transaction — avoids prepared statement cache issues
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM role_permissions WHERE role_name = ?').run(role_name);
      for (const pid of page_ids) {
        db.prepare('INSERT INTO role_permissions (role_name, page_id) VALUES (?, ?)').run(role_name, pid);
      }
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
    res.json({ success: true, role_name, count: page_ids.length });
  } catch (err) {
    console.error('POST permissions error:', err.message);
    res.status(500).json({ error: `Permission save failed: ${err.message}` });
  }
});

// ─── CRUD ROUTES ───

// GET /api/users - List all users (Admin only)
router.get('/', isAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, email, role, created_at,
             can_override_erp_status, can_set_final_status
      FROM users
      ORDER BY id ASC
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Create new user (Admin only)
router.post('/', isAdmin, async (req, res) => {
  const { username, password, role, email, can_override_erp_status, can_set_final_status } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required' });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, email, can_override_erp_status, can_set_final_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      username.trim(), hash, role,
      email ? email.trim() : null,
      can_override_erp_status ? 1 : 0,
      can_set_final_status ? 1 : 0
    );
    const newUser = db.prepare('SELECT id, username, email, role, created_at, can_override_erp_status, can_set_final_status FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, user: newUser });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', isAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot delete the primary admin account' });
    }
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Nullify any user_id references to avoid FK constraint failures
    try { db.prepare('UPDATE order_history SET user_id = NULL WHERE user_id = ?').run(id); } catch (_) {}
    try { db.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(id); } catch (_) {}

    // Temporarily disable FK enforcement during delete
    try { db.exec('PRAGMA foreign_keys = OFF'); } catch (_) {}
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    } finally {
      try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
    }

    res.json({ success: true, deleted_id: id, deleted_username: user.username });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: `Failed to delete user: ${err.message}` });
  }
});

// PUT /api/users/:id - Update user (Admin only)
router.put('/:id', isAdmin, async (req, res) => {
  const { username, role, email, password, can_override_erp_status, can_set_final_status } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: 'Username and role are required' });
  }

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

    const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (password) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      db.prepare(`
        UPDATE users SET username = ?, role = ?, email = ?, password_hash = ?,
                         can_override_erp_status = ?, can_set_final_status = ?
        WHERE id = ?
      `).run(username.trim(), role, email ? email.trim() : null, hash,
             can_override_erp_status ? 1 : 0, can_set_final_status ? 1 : 0, id);
    } else {
      db.prepare(`
        UPDATE users SET username = ?, role = ?, email = ?,
                         can_override_erp_status = ?, can_set_final_status = ?
        WHERE id = ?
      `).run(username.trim(), role, email ? email.trim() : null,
             can_override_erp_status ? 1 : 0, can_set_final_status ? 1 : 0, id);
    }

    const updated = db.prepare('SELECT id, username, email, role, created_at, can_override_erp_status, can_set_final_status FROM users WHERE id = ?').get(id);
    res.json({ success: true, user: updated });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already taken by another account' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
