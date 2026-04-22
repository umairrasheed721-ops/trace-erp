const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/daily', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id is required' });

  try {
    // 1. Get all orders and their metrics grouped by day
    const ordersQuery = `
      SELECT 
        substr(order_date, 1, 10) as date_string,
        COUNT(id) as landed_orders,
        SUM(price) as total_sale,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN price ELSE 0 END) as delivered_sale,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN cost ELSE 0 END) as cgs,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN courier_fee ELSE 0 END) as delivered_courier_fee,
        SUM(courier_fee) as total_courier_fee,
        SUM(paid_amount) as payment_paid,
        
        -- Counts
        SUM(CASE WHEN delivery_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelations,
        SUM(CASE WHEN delivery_status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status = 'Return Received' THEN 1 ELSE 0 END) as restock,
        SUM(CASE WHEN delivery_status = 'Returned' THEN 1 ELSE 0 END) as missing_parcel,
        SUM(CASE WHEN delivery_status IN ('Shipped', 'Out for Delivery', 'In Transit') THEN 1 ELSE 0 END) as intransit,
        SUM(CASE WHEN (tracking_number IS NULL OR tracking_number = '') AND delivery_status != 'Cancelled' THEN 1 ELSE 0 END) as without_tracking_id,
        SUM(CASE WHEN delivery_status = 'Delivered' AND (payment_status = 'Pending' OR payment_status IS NULL) THEN 1 ELSE 0 END) as delivered_payment_pending,
        COALESCE(SUM(CASE WHEN payment_status IN ('Paid', 'Payment Posted') OR (delivery_status IN ('Returned', 'Return Received') AND courier_fee > 0) THEN courier_fee ELSE 0 END), 0) as actual_courier_fees,
        COALESCE(SUM(CASE WHEN payment_status IN ('Paid', 'Payment Posted') OR (delivery_status IN ('Returned', 'Return Received') AND courier_fee > 0) THEN 1 ELSE 0 END), 0) as reconciled_count
      FROM orders
      WHERE store_id = ?
      GROUP BY substr(order_date, 1, 10)
    `;
    const dailyOrders = db.prepare(ordersQuery).all(store_id);

    // 2. Get Fake Returns from Watchdog
    const fakeReturnsQuery = `
      SELECT 
        substr(o.order_date, 1, 10) as date_string,
        COUNT(w.id) as fake_returns
      FROM watchdog_results w
      JOIN orders o ON w.tracking_number = o.tracking_number AND w.store_id = o.store_id
      WHERE w.store_id = ? AND w.verdict LIKE '%FAKE%'
      GROUP BY substr(o.order_date, 1, 10)
    `;
    const fakeReturns = db.prepare(fakeReturnsQuery).all(store_id);

    // 3. Get manual metrics
    const metricsQuery = `
      SELECT date_string, marketing_spend, tiktok_marketing, actual_exp, diff_correction
      FROM daily_metrics
      WHERE store_id = ?
    `;
    const metrics = db.prepare(metricsQuery).all(store_id);

    // Map the supplemental data
    const metricsMap = {};
    metrics.forEach(m => metricsMap[m.date_string] = m);

    const fakeMap = {};
    fakeReturns.forEach(f => fakeMap[f.date_string] = f.fake_returns);

    // Calculate final rows
    const results = dailyOrders.map(day => {
      const dateStr = day.date_string;
      const m = metricsMap[dateStr] || { marketing_spend: 0, tiktok_marketing: 0, actual_exp: 0, diff_correction: 0 };
      const fakeRet = fakeMap[dateStr] || 0;

      const landedOrders = day.landed_orders || 0;
      const cancelations = day.cancelations || 0;
      const pending = day.pending || 0;
      const delivered = day.delivered || 0;
      const restocked = day.restocked || 0;
      const intransit = day.intransit || 0;
      
      const totalDispatched = landedOrders - cancelations - pending;

      const deliveredSale = day.delivered_sale || 0;
      const totalSale = day.total_sale || 0;
      const cgs = day.cgs || 0;
      const paymentPaid = day.payment_paid || 0;

      const marketingSpend = m.marketing_spend || 0;
      const tiktokMarketing = m.tiktok_marketing || 0;
      const actualExp = m.actual_exp || 0;
      const diffCorrection = m.diff_correction || 0;
      const totalMarketing = marketingSpend + tiktokMarketing;

      // Derived Metrics
      const aov = delivered > 0 ? (deliveredSale / delivered) : 0;
      const cgsPercent = deliveredSale > 0 ? (cgs / deliveredSale) * 100 : 0;
      const taxPaid = deliveredSale * 0.04;
      const netSales = deliveredSale - taxPaid;
      const grossProfit = deliveredSale - cgs;
      const marPercent = deliveredSale > 0 ? (totalMarketing / deliveredSale) * 100 : 0;
      
      // 🚚 DYNAMIC COURIER LOGIC (PRE-AGGREGATED)
      const estCourierFee = (totalDispatched || 0) * 200;
      const actualCourierFee = day.actual_courier_fees || 0;
      const reconciledCount = day.reconciled_count || 0;
      const courierDiff = actualCourierFee - (reconciledCount * 200);

      // Hybrid: Actuals for reconciled + 200 for unreconciled
      const unreconciledDispatched = Math.max(0, totalDispatched - reconciledCount);
      const hybridCourierFee = actualCourierFee + (unreconciledDispatched * 200);
      
      const finalPnl = grossProfit - taxPaid - totalMarketing - hybridCourierFee - actualExp;
      
      const delPercent = totalDispatched > 0 ? (delivered / totalDispatched) * 100 : 0;
      const roasMeta = totalMarketing > 0 ? (totalSale / totalMarketing) : 0;
      const cpaAvg = landedOrders > 0 ? (totalMarketing / landedOrders) : 0;
      
      const netOrders = landedOrders - cancelations;
      const netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;
      
      const canPercent = landedOrders > 0 ? (cancelations / landedOrders) * 100 : 0;
      const disPercent = landedOrders > 0 ? (totalDispatched / landedOrders) * 100 : 0;

      return {
        date: dateStr,
        aov,
        deliveredSale,
        cgs,
        cgsPercent,
        netSales,
        taxPaid,
        grossProfit,
        marPercent,
        marketingSpend,
        tiktokMarketing,
        estCourier: estCourierFee,
        actualCourier: actualCourierFee,
        courierDiff: courierDiff,
        hybridCourier: hybridCourierFee,
        actualExp,
        pnl: finalPnl,
        delPercent,
        roasMeta,
        cpaAvg,
        netCpaAvg,
        landedOrders,
        cancelations,
        canPercent,
        pending,
        totalDispatched,
        disPercent,
        delivered,
        restock: day.restock || 0,
        missingParcel: day.missing_parcel || 0,
        intransit,
        fakeReturns: fakeRet,
        withoutTrackingId: day.without_tracking_id || 0,
        paymentPaid,
        diffCorrection,
        deliveredPaymentPending: day.delivered_payment_pending || 0
      };
    });

    // 4. BACKFILL MISSING DATES
    const backfilledResults = [];
    if (results.length > 0) {
      // Find range
      const sortedByDate = [...results].sort((a,b) => a.date.localeCompare(b.date));
      const firstDate = new Date(sortedByDate[0].date);
      const lastDate = new Date(sortedByDate[sortedByDate.length - 1].date);
      
      const resultMap = {};
      results.forEach(r => resultMap[r.date] = r);
      
      const curr = new Date(firstDate);
      while (curr <= lastDate) {
        const dStr = curr.toISOString().split('T')[0];
        if (resultMap[dStr]) {
          backfilledResults.push(resultMap[dStr]);
        } else {
          // Create zeroed row
          const m = metricsMap[dStr] || { marketing_spend: 0, tiktok_marketing: 0, actual_exp: 0, diff_correction: 0 };
          const marketingSpend = m.marketing_spend || 0;
          const tiktokMarketing = m.tiktok_marketing || 0;
          const totalMarketing = marketingSpend + tiktokMarketing;
          
          backfilledResults.push({
            date: dStr, aov: 0, deliveredSale: 0, cgs: 0, cgsPercent: 0, netSales: 0, taxPaid: 0, grossProfit: 0,
            marPercent: 0, marketingSpend, tiktokMarketing, estCourier: 0, actualCourier: 0, courierDiff: 0,
            hybridCourier: 0, actualExp: m.actual_exp || 0, pnl: -(totalMarketing + (m.actual_exp || 0)),
            delPercent: 0, roasMeta: 0, cpaAvg: 0, netCpaAvg: 0, landedOrders: 0, cancelations: 0, canPercent: 0,
            pending: 0, totalDispatched: 0, disPercent: 0, delivered: 0, restock: 0, missingParcel: 0,
            intransit: 0, fakeReturns: 0, withoutTrackingId: 0, paymentPaid: 0, diffCorrection: m.diff_correction || 0,
            deliveredPaymentPending: 0
          });
        }
        curr.setDate(curr.getDate() + 1);
      }
    }

    backfilledResults.sort((a, b) => b.date.localeCompare(a.date));
    res.json(backfilledResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/metrics', (req, res) => {
  const { store_id, date, marketing_spend, tiktok_marketing, actual_exp, diff_correction } = req.body;
  if (!store_id || !date) return res.status(400).json({ error: 'store_id and date required' });

  try {
    const check = db.prepare('SELECT id FROM daily_metrics WHERE store_id = ? AND date_string = ?').get(store_id, date);
    
    if (check) {
      db.prepare(`
        UPDATE daily_metrics 
        SET marketing_spend = ?, tiktok_marketing = ?, actual_exp = ?, diff_correction = ?
        WHERE store_id = ? AND date_string = ?
      `).run(marketing_spend || 0, tiktok_marketing || 0, actual_exp || 0, diff_correction || 0, store_id, date);
    } else {
      db.prepare(`
        INSERT INTO daily_metrics (store_id, date_string, marketing_spend, tiktok_marketing, actual_exp, diff_correction)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(store_id, date, marketing_spend || 0, tiktok_marketing || 0, actual_exp || 0, diff_correction || 0);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-metrics', (req, res) => {
  const { store_id, metric_field, updates } = req.body;
  if (!store_id || !metric_field || !updates || !Array.isArray(updates)) {
    return res.status(400).json({ error: 'store_id, metric_field, and updates array required' });
  }

  // Validate metric_field to prevent SQL injection
  const allowedFields = ['marketing_spend', 'tiktok_marketing', 'actual_exp', 'diff_correction'];
  if (!allowedFields.includes(metric_field)) {
    return res.status(400).json({ error: 'Invalid metric field' });
  }

  try {
    const updateStmt = db.prepare(`
      UPDATE daily_metrics 
      SET ${metric_field} = ? 
      WHERE store_id = ? AND date_string = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO daily_metrics (store_id, date_string, ${metric_field})
      VALUES (?, ?, ?)
    `);
    const checkStmt = db.prepare('SELECT id FROM daily_metrics WHERE store_id = ? AND date_string = ?');

    db.exec('BEGIN TRANSACTION');
    
    for (const update of updates) {
      const { date, value } = update;
      const numValue = parseFloat(value) || 0;
      const check = checkStmt.get(store_id, date);
      
      if (check) {
        updateStmt.run(numValue, store_id, date);
      } else {
        insertStmt.run(store_id, date, numValue);
      }
    }

    db.exec('COMMIT');
    res.json({ success: true, count: updates.length });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: err.message });
  }
});

router.get('/courier-comparison', (req, res) => {
  const { store_id, startDate, endDate } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  let dateFilter = '';
  if (startDate && endDate) {
    dateFilter = `AND order_date BETWEEN '${startDate}' AND '${endDate}'`;
  }

  try {
    const query = `
      SELECT 
        CASE 
          WHEN UPPER(courier) LIKE '%POSTEX%' THEN 'PostEx'
          WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
          WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
          WHEN UPPER(courier) LIKE '%INSTA%' THEN 'InstaLogistics'
          WHEN courier GLOB '*[0-9]*' AND length(courier) < 4 THEN 'PostEx' -- IDs often belong to main courier
          ELSE COALESCE(courier, 'PostEx')
        END as courier_name,
        COUNT(id) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status IN ('Returned', 'Return Received') THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN delivery_status IN ('Pending', 'In Transit', 'Out for Delivery', 'Booked') THEN 1 ELSE 0 END) as in_transit,
        AVG(price) as avg_price,
        AVG(courier_fee) as avg_fee,
        AVG(CASE WHEN delivery_status = 'Delivered' AND status_date IS NOT NULL AND order_date IS NOT NULL 
            THEN (julianday(status_date) - julianday(order_date)) ELSE NULL END) as avg_days_to_deliver
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
        ${dateFilter}
      GROUP BY courier_name
    `;
    const results = db.prepare(query).all(store_id);

    // City-wise success rate per courier
    const cityQuery = `
      SELECT 
        city,
        CASE 
          WHEN UPPER(courier) LIKE '%POSTEX%' THEN 'PostEx'
          WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
          WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
          WHEN UPPER(courier) LIKE '%INSTA%' THEN 'InstaLogistics'
          WHEN courier GLOB '*[0-9]*' AND length(courier) < 4 THEN 'PostEx'
          ELSE COALESCE(courier, 'PostEx')
        END as courier_name,
        COUNT(id) as total,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
        AND city IS NOT NULL AND city != ''
        ${dateFilter}
      GROUP BY city, courier_name
      HAVING total >= 3
    `;
    const cityResults = db.prepare(cityQuery).all(store_id);

    res.json({ comparison: results, cities: cityResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
