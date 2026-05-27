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
    if (req.query.quick === 'true') {
      const tenantId = req.user?.tenant_id || req.tenantId || 'default';
      const templates = db.prepare('SELECT * FROM quick_replies WHERE tenant_id = ? ORDER BY usage_count DESC, id DESC').all(tenantId);
      return res.json({ success: true, templates });
    }
    const templates = db.prepare('SELECT * FROM whatsapp_templates ORDER BY id DESC').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create template
router.post('/', authenticateToken, (req, res) => {
  const { name, content, type, is_default, status, title, text, quick, category, shortcode, media_url, media_type } = req.body;
  
  if (quick === true || req.query.quick === 'true') {
    const tenantId = req.user?.tenant_id || req.tenantId || 'default';
    if (!title || !text) return res.status(400).json({ error: 'Title and text are required' });
    try {
      const result = db.prepare(`
        INSERT INTO quick_replies (tenant_id, title, text, category, shortcode, media_url, media_type, usage_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(tenantId, title, text, category || 'General', shortcode || null, media_url || null, media_type || null);
      return res.json({
        success: true,
        message: 'Template created successfully',
        template: {
          id: result.lastInsertRowid,
          tenant_id: tenantId,
          title,
          text,
          category: category || 'General',
          shortcode: shortcode || null,
          media_url: media_url || null,
          media_type: media_type || null,
          usage_count: 0,
          created_at: new Date().toISOString()
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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

// Increment template usage count
router.post('/:id/usage', authenticateToken, (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  const { id } = req.params;
  try {
    const result = db.prepare('UPDATE quick_replies SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ? AND tenant_id = ?').run(Number(id), tenantId);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Template not found or tenant mismatch' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete template
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    if (req.query.quick === 'true') {
      const tenantId = req.user?.tenant_id || req.tenantId || 'default';
      const result = db.prepare('DELETE FROM quick_replies WHERE id = ? AND tenant_id = ?').run(Number(req.params.id), tenantId);
      if (result.changes === 0) {
        return res.status(404).json({ success: false, error: 'Template not found or tenant mismatch' });
      }
      return res.json({ success: true });
    }
    db.prepare('DELETE FROM whatsapp_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
