const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/webhooks/postex
router.post('/postex', (req, res) => {
  // 1. Security Check
  const authHeader = req.headers.auth;
  if (authHeader !== 'tracepk') {
    console.warn('⚠️ Unauthorized PostEx Webhook Attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  console.log('📬 [WEBHOOK] PostEx Update received:', JSON.stringify(payload));

  /**
   * PostEx typically sends:
   * {
   *   "trackingNumber": "12345",
   *   "transactionStatus": "Delivered",
   *   "statusDateTime": "2024-03-20 12:00:00",
   *   "remarks": "..."
   * }
   */

  const { trackingNumber, transactionStatus, statusDateTime } = payload;
  if (!trackingNumber || !transactionStatus) return res.status(400).json({ error: 'Invalid payload' });

  try {
    // Find order
    const order = db.prepare('SELECT id, delivery_status FROM orders WHERE tracking_number = ?').get(trackingNumber);
    if (!order) {
      console.log(`👻 Webhook order not found: ${trackingNumber}`);
      return res.json({ success: true, message: 'Order not in ERP' });
    }

    // Update status
    // Map PostEx status to ERP if necessary, though PostEx usually sends readable strings
    db.prepare('UPDATE orders SET delivery_status = ?, status_date = ? WHERE id = ?').run(
      transactionStatus,
      statusDateTime || new Date().toISOString(),
      order.id
    );

    console.log(`✅ Webhook update success: ${trackingNumber} -> ${transactionStatus}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
