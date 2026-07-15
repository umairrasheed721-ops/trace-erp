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
    const dbCouriers = db.prepare("SELECT DISTINCT courier FROM orders WHERE courier IS NOT NULL AND courier != '' ORDER BY courier").all().map(r => r.courier);
    const courierSet = new Set(['All', 'PostEx', 'Instaworld', 'Leopards', 'TCS', 'LCS', ...dbCouriers]);
    res.json({ mappings: rows, erp_statuses: ERP_STATUSES, couriers: Array.from(courierSet) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/status-mappings — create
router.post('/', adminOnly, (req, res) => {
  const { courier, courier_status, erp_status, matching_type } = req.body;
  if (!courier_status || !erp_status) return res.status(400).json({ error: 'courier_status and erp_status required' });
  try {
    const result = db.prepare(
      `INSERT INTO status_mappings (courier, courier_status, erp_status, matching_type) VALUES (?, ?, ?, ?)`
    ).run(courier || 'All', courier_status.trim().toLowerCase(), erp_status.trim(), matching_type || 'exact');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Mapping already exists for this courier + status' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/status-mappings/:id — update
router.put('/:id', adminOnly, (req, res) => {
  const { courier, courier_status, erp_status, is_active, matching_type } = req.body;
  try {
    db.prepare(
      `UPDATE status_mappings SET courier=?, courier_status=?, erp_status=?, is_active=?, matching_type=? WHERE id=?`
    ).run(
      courier || 'All',
      (courier_status || '').trim().toLowerCase(),
      (erp_status || '').trim(),
      is_active === false || is_active === 0 ? 0 : 1,
      matching_type || 'exact',
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

// POST /api/status-mappings/test — test mapping lookup logic
router.post('/test', adminOnly, (req, res) => {
  const { courier, raw_status } = req.body;
  if (!raw_status) return res.status(400).json({ error: 'raw_status required' });
  try {
    const statusMapper = require('../engines/tracking/statusMapper');
    const statusMap = statusMapper.loadStatusMaps();
    const result = statusMapper.applyMap(statusMap, courier || 'All', raw_status);
    
    let matchedRule = 'fallback (hardcoded)';
    let ruleId = null;
    
    if (result) {
      const raw = raw_status.toLowerCase().trim();
      const targetCourier = (courier || 'all').toLowerCase().trim();

      // Check if it matched exact
      const exactKey = `${targetCourier}:${raw}`;
      const exactAllKey = `all:${raw}`;
      if (statusMap.exact[exactKey] || statusMap.exact[exactAllKey]) {
        matchedRule = 'exact';
      } else {
        // Check wildcard
        for (const w of statusMap.wildcard) {
          if (w.courier === 'all' || w.courier === targetCourier) {
            if (w.regex.test(raw)) {
              matchedRule = `wildcard (Pattern: "${w.rawPattern}")`;
              ruleId = w.id;
              break;
            }
          }
        }
        if (matchedRule === 'fallback (hardcoded)') {
          // Check regex
          for (const r of statusMap.regex) {
            if (r.courier === 'all' || r.courier === targetCourier) {
              if (r.regex.test(raw)) {
                matchedRule = `regex (Pattern: "${r.rawPattern}")`;
                ruleId = r.id;
                break;
              }
            }
          }
        }
      }
    }

    res.json({
      success: true,
      mapped_status: result || 'Remain Unchanged (No Map)',
      matched_by: result ? matchedRule : 'None',
      rule_id: ruleId
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.ERP_STATUSES = ERP_STATUSES;
