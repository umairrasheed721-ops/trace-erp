const express = require('express');
const router = express.Router();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { authenticateToken } = require('./auth');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../trace_erp.db');
const db = new DatabaseSync(DB_PATH);

// Helper to seed defaults if empty
function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) as count FROM whatsapp_templates').get().count;
  if (count === 0) {
    const defaults = [
      { 
        name: '✅ Order Confirmation', 
        type: 'confirmation', 
        is_default: 1,
        content: 'Hi [Name], thank you for your order [OrderID] from TRACE. Your total is Rs [Price]. Please click here to confirm: [Link]' 
      },
      { 
        name: '🏠 Address Query', 
        type: 'address', 
        is_default: 0,
        content: 'Hi [Name], we have received your order [OrderID], but the address seems incomplete. Could you please provide your House # and Street name?' 
      },
      { 
        name: '🚚 Shipped Update', 
        type: 'shipping', 
        is_default: 0,
        content: 'Hi [Name], your order [OrderID] has been shipped via [Courier]. Your Tracking ID is: [Tracking]' 
      }
    ];
    const insert = db.prepare('INSERT INTO whatsapp_templates (name, content, type, is_default, status) VALUES (?, ?, ?, ?, ?)');
    defaults.forEach(d => insert.run(d.name, d.content, d.type, d.is_default, 'active'));
    console.log('✅ Default WhatsApp templates seeded.');
  }
}
seedDefaults();

// Get all templates
router.get('/', authenticateToken, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM whatsapp_templates ORDER BY id DESC').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create template
router.post('/', authenticateToken, (req, res) => {
  const { name, content, type, is_default, status } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content required' });
  
  try {
    if (is_default) {
      db.prepare('UPDATE whatsapp_templates SET is_default = 0 WHERE type = ?').run(type);
    }
    const result = db.prepare('INSERT INTO whatsapp_templates (name, content, type, is_default, status) VALUES (?, ?, ?, ?, ?)').run(name, content, type || 'custom', is_default ? 1 : 0, status || 'active');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update template
router.put('/:id', authenticateToken, (req, res) => {
  const { name, content, type, is_default, status } = req.body;
  const { id } = req.params;
  
  try {
    if (is_default) {
      db.prepare('UPDATE whatsapp_templates SET is_default = 0 WHERE type = ?').run(type);
    }
    db.prepare('UPDATE whatsapp_templates SET name = ?, content = ?, type = ?, is_default = ?, status = ? WHERE id = ?').run(name, content, type, is_default ? 1 : 0, status || 'active', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete template
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM whatsapp_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
