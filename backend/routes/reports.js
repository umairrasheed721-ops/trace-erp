const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/reports/daily
router.get('/daily', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id is required' });

  try {
    // 1. Get aggregated order data by day (only Delivered)
    const ordersQuery = `
      SELECT 
        substr(order_date, 1, 10) as date_string,
        COUNT(id) as total_delivered_orders,
        SUM(price) as delivered_sale,
        SUM(cost) as cgs,
        SUM(courier_fee) as est_courier
      FROM orders
      WHERE store_id = ? AND delivery_status = 'Delivered'
      GROUP BY substr(order_date, 1, 10)
    `;
    const dailyOrders = db.prepare(ordersQuery).all(store_id);

    // 2. Get total orders by day (for AOV and landed orders)
    const allOrdersQuery = `
      SELECT 
        substr(order_date, 1, 10) as date_string,
        COUNT(id) as total_orders,
        SUM(CASE WHEN delivery_status IN ('Returned', 'RTO', 'Returned to Origin', 'Cancelled') THEN 1 ELSE 0 END) as cancelations
      FROM orders
      WHERE store_id = ?
      GROUP BY substr(order_date, 1, 10)
    `;
    const allOrders = db.prepare(allOrdersQuery).all(store_id);

    // 3. Get manual metrics
    const metricsQuery = `
      SELECT date_string, marketing_spend, actual_exp
      FROM daily_metrics
      WHERE store_id = ?
    `;
    const metrics = db.prepare(metricsQuery).all(store_id);

    // Combine data
    const metricsMap = {};
    metrics.forEach(m => metricsMap[m.date_string] = m);

    const allOrdersMap = {};
    allOrders.forEach(o => allOrdersMap[o.date_string] = o);

    const results = dailyOrders.map(day => {
      const dateStr = day.date_string;
      const allOrd = allOrdersMap[dateStr] || { total_orders: 0, cancelations: 0 };
      const m = metricsMap[dateStr] || { marketing_spend: 0, actual_exp: 0 };

      const deliveredSale = day.delivered_sale || 0;
      const cgs = day.cgs || 0;
      const aov = allOrd.total_orders > 0 ? (deliveredSale / allOrd.total_orders) : 0; // Or based on delivered orders? Sheet AOV uses all orders maybe? Let's stick to total sales / total orders if possible. Wait, AOV is usually total sales / number of orders. Let's use delivered sale / delivered orders for now, or just total sale / total orders. 
      // Actually AOV = Delivered Sale / Delivered Orders is safer for PNL.
      const actualAov = day.total_delivered_orders > 0 ? (deliveredSale / day.total_delivered_orders) : 0;
      
      const cgsPercent = deliveredSale > 0 ? (cgs / deliveredSale) * 100 : 0;
      const taxPaid = deliveredSale * 0.04; // 4% tax
      const netSales = deliveredSale - taxPaid;
      const grossProfit = deliveredSale - cgs;
      const marPercent = deliveredSale > 0 ? (m.marketing_spend / deliveredSale) * 100 : 0;
      const estCourier = day.est_courier || 0;
      
      const pnl = grossProfit - taxPaid - m.marketing_spend - estCourier - m.actual_exp;
      
      // For Month vise metrics
      const landedOrders = allOrd.total_orders;
      const cancelations = allOrd.cancelations;
      const canPercent = landedOrders > 0 ? (cancelations / landedOrders) * 100 : 0;
      const delPercent = landedOrders > 0 ? (day.total_delivered_orders / landedOrders) * 100 : 0;

      return {
        date: dateStr,
        aov: actualAov,
        deliveredSale,
        cgs,
        cgsPercent,
        netSales, // -4% tax
        taxPaid,
        grossProfit,
        marPercent,
        marketingSpend: m.marketing_spend,
        estCourier,
        actualExp: m.actual_exp,
        pnl,
        delPercent,
        landedOrders,
        cancelations,
        canPercent
      };
    });

    // Sort descending by date
    results.sort((a, b) => b.date.localeCompare(a.date));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/metrics
router.post('/metrics', (req, res) => {
  const { store_id, date, marketing_spend, actual_exp } = req.body;
  if (!store_id || !date) return res.status(400).json({ error: 'store_id and date required' });

  try {
    const check = db.prepare('SELECT id FROM daily_metrics WHERE store_id = ? AND date_string = ?').get(store_id, date);
    
    if (check) {
      db.prepare(`
        UPDATE daily_metrics 
        SET marketing_spend = ?, actual_exp = ?
        WHERE store_id = ? AND date_string = ?
      `).run(marketing_spend || 0, actual_exp || 0, store_id, date);
    } else {
      db.prepare(`
        INSERT INTO daily_metrics (store_id, date_string, marketing_spend, actual_exp)
        VALUES (?, ?, ?, ?)
      `).run(store_id, date, marketing_spend || 0, actual_exp || 0);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
