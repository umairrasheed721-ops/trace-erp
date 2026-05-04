const express = require('express');
const router = express.Router();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../trace_erp.db');
const db = new DatabaseSync(DB_PATH);

// Public Order Confirmation
router.get('/confirm-order/:token', (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).send('Invalid Link');

  try {
    const order = db.prepare('SELECT id, ref_number, customer_name, delivery_status FROM orders WHERE confirmation_token = ?').get(token);
    
    if (!order) {
      return res.status(404).send('<h1>Order Not Found</h1><p>This link may have expired or is invalid.</p>');
    }

    if (order.delivery_status === 'Confirmed on WhatsApp' || order.delivery_status === 'Confirmed') {
      return res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #4CAF50;">✅ Already Confirmed</h1>
          <p>Hi ${order.customer_name}, your order #${order.ref_number || order.id} is already confirmed. We are processing it!</p>
        </div>
      `);
    }

    // Update the order status
    db.prepare("UPDATE orders SET delivery_status = 'Confirmed on WhatsApp', status_date = datetime('now') WHERE id = ?").run(order.id);

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #4CAF50;">✅ Order Confirmed!</h1>
        <p>Thank you ${order.customer_name}! Your order #${order.ref_number || order.id} has been confirmed on WhatsApp.</p>
        <p>Our team will process it shortly.</p>
      </div>
    `);
  } catch (err) {
    console.error('Public confirmation error', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
