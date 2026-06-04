const express = require('express');
const router = express.Router();
const { db } = require('../../db');

// GET /api/whatsapp-governance/optouts
router.get('/optouts', (req, res) => {
  try {
    const rows = db.prepare('SELECT phone, vip_status, total_orders, updated_at FROM customer_profiles WHERE opted_out = 1 ORDER BY updated_at DESC').all() || [];
    res.json({ success: true, optouts: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/optout
router.post('/optout', (req, res) => {
  const { phone, opted_out } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  try {
    const cleaned = phone.replace(/\D/g, '');
    db.prepare(`
      INSERT INTO customer_profiles (phone, opted_out, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET opted_out = ?, updated_at = datetime('now')
    `).run(cleaned, opted_out ? 1 : 0, opted_out ? 1 : 0);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
