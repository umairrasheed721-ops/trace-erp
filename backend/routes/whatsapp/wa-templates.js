const express = require('express');
const router = express.Router();
const { db, DB_DIR } = require('../../db');
const path = require('path');
const fs = require('fs');

const getMediaFilePath = (mediaUrl) => {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('/uploads/')) {
    return path.join(DB_DIR, 'uploads', mediaUrl.substring(9));
  }
  return path.join(DB_DIR, 'uploads', mediaUrl);
};

// GET /api/whatsapp-governance/templates
router.get('/templates', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const rows = db.prepare('SELECT * FROM quick_replies WHERE tenant_id = ? ORDER BY id DESC').all(tenantId);
    res.json({ success: true, templates: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/templates
router.post('/templates', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  const { title, text } = req.body;
  if (!title || !text) {
    return res.status(400).json({ success: false, error: 'Title and text are required' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO quick_replies (tenant_id, title, text)
      VALUES (?, ?, ?)
    `).run(tenantId, title, text);
    res.json({ 
      success: true, 
      message: 'Template created successfully',
      template: {
        id: result.lastInsertRowid,
        tenant_id: tenantId,
        title,
        text,
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/whatsapp-governance/templates/:id
router.delete('/templates/:id', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM quick_replies WHERE id = ? AND tenant_id = ?').run(Number(id), tenantId);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Template not found or tenant mismatch' });
    }
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/whatsapp-governance/quick-replies
router.get('/quick-replies', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM whatsapp_quick_replies ORDER BY id DESC').all();
    res.json({ success: true, quickReplies: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/quick-replies (Upload media and save)
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath = path.join(DB_DIR, 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.post('/quick-replies', upload.single('media'), (req, res) => {
  const { title, caption } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  
  try {
    let mediaUrl = null;
    let mediaType = null;
    
    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    }
    
    db.prepare(`
      INSERT INTO whatsapp_quick_replies (title, media_url, media_type, caption)
      VALUES (?, ?, ?, ?)
    `).run(title, mediaUrl, mediaType, caption || '');
    
    res.json({ success: true, message: 'Quick reply saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/whatsapp-governance/quick-replies/:id
router.delete('/quick-replies/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Delete file from disk if it exists
    const row = db.prepare('SELECT media_url FROM whatsapp_quick_replies WHERE id = ?').get(Number(id));
    if (row && row.media_url) {
      const filePath = getMediaFilePath(row.media_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    db.prepare('DELETE FROM whatsapp_quick_replies WHERE id = ?').run(Number(id));
    res.json({ success: true, message: 'Quick reply deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/quick-pills
router.get('/quick-pills', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM whatsapp_quick_pills ORDER BY sort_order ASC').all();
    res.json({ success: true, quickPills: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/quick-pills
router.post('/quick-pills', (req, res) => {
  const { pill_text } = req.body;
  if (!pill_text || !pill_text.trim()) return res.status(400).json({ error: 'Pill text is required' });

  try {
    const row = db.prepare('SELECT MAX(sort_order) as max_sort FROM whatsapp_quick_pills').get();
    const nextSort = (row?.max_sort || 0) + 1;

    db.prepare('INSERT INTO whatsapp_quick_pills (pill_text, sort_order) VALUES (?, ?)').run(pill_text, nextSort);
    res.json({ success: true, message: 'Quick pill saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/whatsapp-governance/quick-pills/:id
router.delete('/quick-pills/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM whatsapp_quick_pills WHERE id = ?').run(Number(id));
    res.json({ success: true, message: 'Quick pill deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
