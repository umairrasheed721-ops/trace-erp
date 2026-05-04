const express = require('express');
const router = express.Router();
const { db } = require('../db');

// --- 🛠️ HEALTH AUDITS ---

// 1. Check for orders with 0 cost
router.get('/audit/zero-costs', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT id, ref_number, customer_name, product_titles, price 
      FROM orders 
      WHERE (cost = 0 OR cost IS NULL) 
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'Voided')
      LIMIT 100
    `).all();
    res.json({ results: orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Check for orphaned master costs (no matching product title)
router.get('/audit/orphaned-costs', (req, res) => {
  try {
    const orphaned = db.prepare(`
      SELECT m.id, m.parent_title, m.variant_title 
      FROM product_master_costs m
      LEFT JOIN orders o ON o.product_titles LIKE '%' || m.parent_title || '%'
      WHERE o.id IS NULL
      LIMIT 100
    `).all();
    res.json({ results: orphaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. System Stats
router.get('/stats', (req, res) => {
  try {
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const auditCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    
    res.json({
      orders: orderCount,
      stores: storeCount,
      users: userCount,
      auditLogs: auditCount,
      memory: process.memoryUsage().rss / 1024 / 1024
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
