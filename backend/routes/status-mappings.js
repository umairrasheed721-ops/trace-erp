// ============================================================
// 🗺️  STATUS MAPPINGS — Admin-only CRUD
// Courier raw status → ERP status configuration
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../db');

const ERP_STATUSES = [
  'Pending', 'Confirmed', 'Booked', 'Picked Up', 'In Transit',
  'Out for Delivery', 'Attempted', 'Shipper Advice', 'Undelivered',
  'Refused', 'Delivered', 'Return Initiated',
  'Returned', 'Cancelled'
];

// --- Auth guard: admin only ---
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET /api/status-mappings — list all
router.get('/', adminOnly, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM status_mappings ORDER BY courier, courier_status`).all();
    res.json({ mappings: rows, erp_statuses: ERP_STATUSES });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status-mappings — create
router.post('/', adminOnly, (req, res) => {
  const { courier, courier_status, erp_status } = req.body;
  if (!courier_status || !erp_status) return res.status(400).json({ error: 'courier_status and erp_status required' });
  try {
    const result = db.prepare(
      `INSERT INTO status_mappings (courier, courier_status, erp_status) VALUES (?, ?, ?)`
    ).run(courier || 'All', courier_status.trim().toLowerCase(), erp_status.trim());
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Mapping already exists for this courier + status' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/status-mappings/:id — update
router.put('/:id', adminOnly, (req, res) => {
  const { courier, courier_status, erp_status, is_active } = req.body;
  try {
    db.prepare(
      `UPDATE status_mappings SET courier=?, courier_status=?, erp_status=?, is_active=? WHERE id=?`
    ).run(
      courier || 'All',
      (courier_status || '').trim().toLowerCase(),
      (erp_status || '').trim(),
      is_active === false || is_active === 0 ? 0 : 1,
      req.params.id
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/status-mappings/:id/toggle — toggle active
router.patch('/:id/toggle', adminOnly, (req, res) => {
  try {
    db.prepare(`UPDATE status_mappings SET is_active = 1 - is_active WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/status-mappings/:id — delete
router.delete('/:id', adminOnly, (req, res) => {
  try {
    db.prepare(`DELETE FROM status_mappings WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.ERP_STATUSES = ERP_STATUSES;
