const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/orders?store_id=1&page=1&limit=100&status=&search=
router.get('/', (req, res) => {
  const { store_id, page = 1, limit = 100, status, search, courier } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  let conditions = ['store_id = ?'];
  let params = [store_id];

  if (status) { conditions.push('LOWER(delivery_status) = ?'); params.push(status.toLowerCase()); }
  if (courier) { conditions.push('LOWER(courier) = ?'); params.push(courier.toLowerCase()); }
  if (search) {
    conditions.push('(tracking_number LIKE ? OR customer_name LIKE ? OR ref_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE ${where}`).get(...params);
  const orders = db.prepare(`
    SELECT * FROM orders WHERE ${where}
    ORDER BY created_timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ orders, total: total.count, page: parseInt(page), limit: parseInt(limit) });
});

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', (req, res) => {
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'hold_reason', 'return_status'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const extraSets = [];
  const extraValues = [];
  const today = new Date().toISOString().split('T')[0];

  // 4. P&L LOGIC: Auto-stamp payment_date when status flips to Delivered
  if (req.body.delivery_status) {
    const newStatus = (req.body.delivery_status || '').toLowerCase();
    if (newStatus.includes('delivered')) {
      // Only stamp if not already set
      const existing = db.prepare('SELECT payment_date FROM orders WHERE id = ?').get(req.params.id);
      if (!existing?.payment_date) {
        extraSets.push('payment_date = ?');
        extraValues.push(today);
      }
    }
    // Auto-clear P&L date if returned/cancelled
    if (newStatus.includes('return') || newStatus.includes('cancel')) {
      extraSets.push('payment_date = ?');
      extraValues.push(null);
    }
  }

  // 3. PAID AMOUNT LOGIC: Auto-flip payment_status to Paid when paid_amount > 0
  if (req.body.paid_amount !== undefined) {
    const paidAmt = parseFloat(req.body.paid_amount) || 0;
    const order = db.prepare('SELECT price FROM orders WHERE id = ?').get(req.params.id);
    if (paidAmt > 0 && order) {
      const newPaymentStatus = paidAmt >= (parseFloat(order.price) || 0) ? 'Paid' : 'Partial';
      if (!req.body.payment_status) {
        extraSets.push('payment_status = ?');
        extraValues.push(newPaymentStatus);
      }
    }
  }

  const allSets = [...updates.map(k => `${k} = ?`), ...extraSets].join(', ');
  const allValues = [...updates.map(k => req.body[k]), ...extraValues];

  db.prepare(`UPDATE orders SET ${allSets} WHERE id = ?`).run(...allValues, req.params.id);

  // Return updated row so frontend can reflect all auto-changes
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json({ success: true, order: updated });
});

// GET /api/orders/export?store_id=1 - Export all orders as JSON for CSV download
router.get('/export', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const orders = db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_timestamp DESC').all(store_id);
  res.json(orders);
});

module.exports = router;
