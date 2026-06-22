const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/daily', (req, res) => {
  const { store_id, start_date, end_date } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id is required' });

  try {
    let whereClauses = ['store_id = ?'];
    const params = [Number(store_id)];

    if (start_date) {
      whereClauses.push('order_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push('order_date <= ?');
      params.push(end_date);
    }

    const whereString = whereClauses.join(' AND ');

    // 1. Get all orders and their metrics grouped by day
    const ordersQuery = `
      SELECT 
        substr(order_date, 1, 10) as date_string,
        COUNT(id) as landed_orders,
        SUM(price) as total_sale,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN price ELSE 0 END) as delivered_sale,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN (cost - packaging_cost) ELSE 0 END) as pure_cgs,
        SUM(CASE WHEN delivery_status NOT IN ('Pending', 'Cancelled', 'Booked') THEN packaging_cost ELSE 0 END) as total_packaging,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN courier_fee ELSE 0 END) as delivered_courier_fee,
        SUM(courier_fee) as total_courier_fee,
        SUM(paid_amount) as payment_paid,
        
        -- Counts
        SUM(CASE WHEN delivery_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelations,
        SUM(CASE WHEN delivery_status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN delivery_status IN ('Booked', 'Picked Up', 'Unassigned') THEN 1 ELSE 0 END) as booked,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status = 'Return Received' THEN 1 ELSE 0 END) as restock,
        SUM(CASE WHEN delivery_status = 'Returned' THEN 1 ELSE 0 END) as missing_parcel,
        SUM(CASE WHEN delivery_status IN ('Shipped', 'Out for Delivery', 'In Transit') THEN 1 ELSE 0 END) as intransit,
        SUM(CASE WHEN (tracking_number IS NULL OR tracking_number = '') AND delivery_status != 'Cancelled' THEN 1 ELSE 0 END) as without_tracking_id,
        SUM(CASE WHEN LOWER(delivery_status) LIKE '%delivered%' AND (paid_amount IS NULL OR paid_amount < 1) THEN 1 ELSE 0 END) as delivered_payment_pending,
        SUM(CASE WHEN delivery_status = 'Delivered' AND (cost IS NULL OR cost = 0) THEN 1 ELSE 0 END) as cost_gaps,
        SUM(CASE WHEN LOWER(delivery_status) LIKE '%delivered%' AND (paid_amount IS NULL OR paid_amount < 1) THEN price ELSE 0 END) as unpaid_amount,
        SUM(CASE WHEN delivery_status = 'Delivered' AND (payment_status != 'Paid' AND payment_status != 'Payment Posted' OR payment_status IS NULL) AND (julianday('now', '+5 hours') - julianday(COALESCE(status_date, order_date))) > 10 THEN 1 ELSE 0 END) as overdue_payout_count,
        SUM(CASE WHEN (courier_fee IS NULL OR courier_fee < 1) AND LOWER(delivery_status) NOT IN ('pending', 'cancelled') AND (tracking_number IS NOT NULL AND tracking_number != '') THEN 1 ELSE 0 END) as zero_expense_count,
        COALESCE(SUM(CASE WHEN payment_status IN ('Paid', 'Payment Posted') OR (delivery_status IN ('Returned', 'Return Received') AND courier_fee > 0) THEN courier_fee ELSE 0 END), 0) as actual_courier_fees,
        COALESCE(SUM(CASE WHEN payment_status IN ('Paid', 'Payment Posted') OR (delivery_status IN ('Returned', 'Return Received') AND courier_fee > 0) THEN 1 ELSE 0 END), 0) as reconciled_count
      FROM orders
      WHERE ${whereString}
      GROUP BY substr(order_date, 1, 10)
    `;
    const dailyOrders = db.prepare(ordersQuery).all(...params);

    // 2. Get Fake Returns from Watchdog
    let fakeReturnsQuery = `
      SELECT 
        substr(o.order_date, 1, 10) as date_string,
        COUNT(w.id) as fake_returns
      FROM watchdog_results w
      JOIN orders o ON w.tracking_number = o.tracking_number AND w.store_id = o.store_id
      WHERE w.store_id = ? AND w.verdict LIKE '%FAKE%'
    `;
    const fakeParams = [Number(store_id)];
    if (start_date) {
      fakeReturnsQuery += ' AND o.order_date >= ?';
      fakeParams.push(start_date);
    }
    if (end_date) {
      fakeReturnsQuery += ' AND o.order_date <= ?';
      fakeParams.push(end_date);
    }
    fakeReturnsQuery += ' GROUP BY substr(o.order_date, 1, 10)';
    const fakeReturns = db.prepare(fakeReturnsQuery).all(...fakeParams);

    // 3. Get manual metrics
    let metricsQuery = `
      SELECT date_string, marketing_spend, tiktok_marketing, actual_exp, diff_correction
      FROM daily_metrics
      WHERE store_id = ?
    `;
    const metricsParams = [Number(store_id)];
    if (start_date) {
      metricsQuery += ' AND date_string >= ?';
      metricsParams.push(start_date);
    }
    if (end_date) {
      metricsQuery += ' AND date_string <= ?';
      metricsParams.push(end_date);
    }
    const metrics = db.prepare(metricsQuery).all(...metricsParams);

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
      const booked = day.booked || 0;
      
      // Calculate true dispatches (exclude pre-transit statuses)
      const totalDispatched = landedOrders - cancelations - pending - booked;

      const deliveredSale = day.delivered_sale || 0;
      const totalSale = day.total_sale || 0;
      const pureCgs = day.pure_cgs || 0;
      const sunkPackaging = day.total_packaging || 0;
      const paymentPaid = day.payment_paid || 0;

      const marketingSpend = m.marketing_spend || 0;
      const tiktokMarketing = m.tiktok_marketing || 0;
      const actualExp = m.actual_exp || 0;
      const diffCorrection = m.diff_correction || 0;
      const totalMarketing = marketingSpend + tiktokMarketing;

      // Derived Metrics
      const delivered = day.delivered || 0;
      const aov = delivered > 0 ? (deliveredSale / delivered) : 0;
      const cgsPercent = deliveredSale > 0 ? ((pureCgs + sunkPackaging) / deliveredSale) * 100 : 0;
      const taxPaid = deliveredSale * 0.04;
      const netSales = deliveredSale - taxPaid;
      const grossProfit = deliveredSale - pureCgs - sunkPackaging;
      const marPercent = deliveredSale > 0 ? (totalMarketing / deliveredSale) * 100 : 0;
      
      // 🚚 DYNAMIC COURIER LOGIC (PRE-AGGREGATED)
      const estCourierFee = (totalDispatched || 0) * 200;
      const actualCourierFee = day.actual_courier_fees || 0;
      const reconciledCount = day.reconciled_count || 0;
      const courierDiff = actualCourierFee - (reconciledCount * 200);

      // Hybrid: Actuals for reconciled + 200 for unreconciled
      const unreconciledDispatched = Math.max(0, totalDispatched - reconciledCount);
      const hybridCourierFee = actualCourierFee + (unreconciledDispatched * 200);
      
      const finalPnl = grossProfit - totalMarketing - hybridCourierFee - actualExp;
      
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
        cgs: pureCgs + sunkPackaging,
        pureCgs,
        sunkPackaging,
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
        booked,
        totalDispatched,
        disPercent,
        delivered,
        restock: day.restock || 0,
        missingParcel: day.missing_parcel || 0,
        intransit: day.intransit || 0,
        fakeReturns: fakeRet,
        withoutTrackingId: day.without_tracking_id || 0,
        paymentPaid,
        diffCorrection,
        deliveredPaymentPending: day.delivered_payment_pending || 0,
        costGaps: day.cost_gaps || 0,
        unpaidAmount: day.unpaid_amount || 0,
        overduePayoutCount: day.overdue_payout_count || 0,
        zeroExpenseCount: day.zero_expense_count || 0
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
            date: dStr, aov: 0, deliveredSale: 0, cgs: 0, pureCgs: 0, sunkPackaging: 0, cgsPercent: 0, netSales: 0, taxPaid: 0, grossProfit: 0,
            marPercent: 0, marketingSpend, tiktokMarketing, estCourier: 0, actualCourier: 0, courierDiff: 0,
            hybridCourier: 0, actualExp: m.actual_exp || 0, pnl: -(totalMarketing + (m.actual_exp || 0)),
            delPercent: 0, roasMeta: 0, cpaAvg: 0, netCpaAvg: 0, landedOrders: 0, cancelations: 0, canPercent: 0,
            pending: 0, booked: 0, totalDispatched: 0, disPercent: 0, delivered: 0, restock: 0, missingParcel: 0,
            intransit: 0, fakeReturns: 0, withoutTrackingId: 0, paymentPaid: 0, diffCorrection: m.diff_correction || 0,
            deliveredPaymentPending: 0, costGaps: 0, unpaidAmount: 0, overduePayoutCount: 0, zeroExpenseCount: 0
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
          WHEN UPPER(courier) LIKE '%POSTEX%' OR UPPER(courier) LIKE '%POST EX%' THEN 'PostEx'
          WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
          WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
          WHEN UPPER(courier) LIKE '%INSTA%' OR UPPER(courier) LIKE '%INSTAWORLD%' OR UPPER(courier) LIKE '%ILOGISTIC%' THEN 'InstaLogistics'
          WHEN courier GLOB '*[0-9]*' AND length(TRIM(courier)) < 6 THEN 'PostEx'
          WHEN courier IS NULL OR TRIM(courier) = '' THEN 'PostEx'
          ELSE TRIM(courier)
        END as courier_name,
        COUNT(id) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status = 'Delivered' AND COALESCE(failed_attempts, 0) = 0 THEN 1 ELSE 0 END) as first_attempt_delivered,
        SUM(CASE WHEN delivery_status = 'Delivered' AND COALESCE(failed_attempts, 0) > 0 THEN 1 ELSE 0 END) as multiple_attempt_delivered,
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
          WHEN UPPER(courier) LIKE '%POSTEX%' OR UPPER(courier) LIKE '%POST EX%' THEN 'PostEx'
          WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
          WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
          WHEN UPPER(courier) LIKE '%INSTA%' OR UPPER(courier) LIKE '%INSTAWORLD%' OR UPPER(courier) LIKE '%ILOGISTIC%' THEN 'InstaLogistics'
          WHEN courier GLOB '*[0-9]*' AND length(TRIM(courier)) < 6 THEN 'PostEx'
          WHEN courier IS NULL OR TRIM(courier) = '' THEN 'PostEx'
          ELSE TRIM(courier)
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

router.get('/profitability-chart-data', (req, res) => {
  const { store_id, days = 30 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - parseInt(days));
    const dateStr = dateLimit.toISOString().split('T')[0];

    const query = `
      SELECT 
        substr(o.order_date, 1, 10) as date,
        SUM(o.price) as revenue,
        SUM(o.cost) as total_cost,
        SUM(CASE WHEN o.delivery_status = 'Delivered' THEN o.price ELSE 0 END) as delivered_revenue,
        COALESCE(m.marketing_spend, 0) + COALESCE(m.tiktok_marketing, 0) as ad_spend
      FROM orders o
      LEFT JOIN daily_metrics m ON substr(o.order_date, 1, 10) = m.date_string AND o.store_id = m.store_id
      WHERE o.store_id = ? AND o.order_date >= ?
      GROUP BY substr(o.order_date, 1, 10)
      ORDER BY o.order_date ASC
    `;
    const results = db.prepare(query).all(store_id, dateStr);

    const chartData = results.map(row => ({
      date: row.date,
      revenue: Math.round(row.revenue),
      netProfit: Math.round(row.delivered_revenue - row.total_cost - row.ad_spend),
      adSpend: Math.round(row.ad_spend),
      roi: row.ad_spend > 0 ? parseFloat((row.revenue / row.ad_spend).toFixed(2)) : 0
    }));

    res.json(chartData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/logistics-intelligence - Comprehensive offline courier auditing (10 metrics)
router.get('/logistics-intelligence', (req, res) => {
  const { store_id, startDate, endDate } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const courierCase = `
    CASE 
      WHEN UPPER(courier) LIKE '%POSTEX%' OR UPPER(courier) LIKE '%POST EX%' THEN 'PostEx'
      WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
      WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
      WHEN UPPER(courier) LIKE '%INSTA%' OR UPPER(courier) LIKE '%INSTAWORLD%' OR UPPER(courier) LIKE '%INSTA WORLD%' OR UPPER(courier) LIKE '%ILOGISTIC%' THEN 'InstaLogistics'
      WHEN courier GLOB '*[0-9]*' AND length(TRIM(courier)) < 6 THEN 'PostEx'
      WHEN courier IS NULL OR TRIM(courier) = '' THEN 'PostEx'
      ELSE TRIM(courier)
    END
  `;

  let dateFilter = '';
  const baseParams = [Number(store_id)];
  if (startDate && endDate) {
    dateFilter = `AND order_date BETWEEN ? AND ?`;
    baseParams.push(startDate, endDate);
  }

  try {
    // ── 1. Cost-Per-Delivery by Courier ──────────────────────────────────────
    const costPerDelivery = db.prepare(`
      SELECT 
        ${courierCase} as courier_name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN 1 ELSE 0 END) as returned,
        ROUND(AVG(CASE WHEN delivery_status = 'Delivered' THEN courier_fee ELSE NULL END), 0) as avg_fee_delivered,
        ROUND(AVG(courier_fee), 0) as avg_fee_all,
        SUM(courier_fee) as total_fee_paid
      FROM orders
      WHERE store_id = ? AND courier_fee > 0 AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY courier_name
      HAVING total_orders >= 3
      ORDER BY total_orders DESC
    `).all(...baseParams);

    // ── 2. Revenue Leaked via Returns ─────────────────────────────────────────
    const returnLoss = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN 1 ELSE 0 END) as return_count,
        ROUND(SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN price ELSE 0 END), 0) as lost_revenue,
        ROUND(SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN courier_fee ELSE 0 END), 0) as return_shipping_cost,
        ROUND(SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN cost ELSE 0 END), 0) as inventory_cost_at_risk
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY courier_name
      HAVING return_count > 0
      ORDER BY lost_revenue DESC
    `).all(...baseParams);

    // ── 3. Profit per Courier ─────────────────────────────────────────────────
    const profitByCourier = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN 1 ELSE 0 END) as returned,
        ROUND(SUM(CASE WHEN delivery_status = 'Delivered' THEN price ELSE 0 END), 0) as revenue,
        ROUND(SUM(CASE WHEN delivery_status = 'Delivered' THEN cost ELSE 0 END), 0) as cogs,
        ROUND(SUM(CASE WHEN delivery_status = 'Delivered' THEN courier_fee ELSE 0 END), 0) as courier_cost,
        ROUND(SUM(CASE WHEN delivery_status = 'Delivered' THEN (price - cost - courier_fee) ELSE 0 END), 0) as net_profit,
        ROUND(AVG(CASE WHEN delivery_status = 'Delivered' THEN (price - cost - courier_fee) ELSE NULL END), 0) as avg_profit_per_order,
        ROUND(AVG(CASE WHEN delivery_status = 'Delivered' THEN courier_fee ELSE NULL END), 0) as avg_delivery_cost,
        ROUND(AVG(CASE WHEN delivery_status IN ('Returned','Return Received') THEN courier_fee ELSE NULL END), 0) as avg_return_cost
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY courier_name
      HAVING delivered > 0
      ORDER BY net_profit DESC
    `).all(...baseParams);

    // ── 4. Dead Zone Cities (delivery rate < 50%, min 5 orders) ─────────────
    const deadZoneCities = db.prepare(`
      SELECT
        city,
        ${courierCase} as courier_name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status IN ('Returned','Return Received') THEN 1 ELSE 0 END) as returned,
        ROUND(100.0 * SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) / COUNT(*), 1) as delivery_rate
      FROM orders
      WHERE store_id = ? AND city IS NOT NULL AND city != '' 
        AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY city, courier_name
      HAVING total_orders >= 5 AND delivery_rate < 50
      ORDER BY delivery_rate ASC
      LIMIT 20
    `).all(...baseParams);

    // ── 5. Pending Cost Exposure ──────────────────────────────────────────────
    const pendingExposure = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        SUM(CASE WHEN delivery_status IN ('Booked','In Transit','Out for Delivery','Picked Up','Shipped') THEN 1 ELSE 0 END) as in_transit_count,
        ROUND(SUM(CASE WHEN delivery_status IN ('Booked','In Transit','Out for Delivery','Picked Up','Shipped') THEN COALESCE(courier_fee, 0) ELSE 0 END), 0) as actual_committed_fee,
        ROUND(SUM(CASE WHEN delivery_status IN ('Booked','In Transit','Out for Delivery','Picked Up','Shipped') THEN price ELSE 0 END), 0) as cod_at_risk
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
      GROUP BY courier_name
      HAVING in_transit_count > 0
      ORDER BY cod_at_risk DESC
    `).all(Number(store_id));

    // ── 6. Weekly Trend: Delivery Rate by Courier (last 12 weeks) ────────────
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    const weeklyTrend = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        CAST((julianday(order_date) - julianday('2024-01-01')) / 7 AS INTEGER) as week_num,
        MIN(order_date) as week_start,
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
        ROUND(100.0 * SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) / COUNT(*), 1) as delivery_rate
      FROM orders
      WHERE store_id = ? AND order_date >= ? 
        AND tracking_number IS NOT NULL AND tracking_number != ''
      GROUP BY courier_name, week_num
      HAVING total_orders >= 3
      ORDER BY week_start ASC, courier_name
    `).all(Number(store_id), twelveWeeksAgo.toISOString().split('T')[0]);

    // ── 7. Failed Attempt Cost Calculator ────────────────────────────────────
    const failedAttemptCosts = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        SUM(CASE WHEN COALESCE(failed_attempts,0) > 0 THEN 1 ELSE 0 END) as orders_with_failed_attempts,
        SUM(COALESCE(failed_attempts, 0)) as total_failed_attempts,
        ROUND(SUM(CASE WHEN COALESCE(failed_attempts,0) > 0 THEN courier_fee ELSE 0 END), 0) as fee_on_multi_attempt,
        ROUND(AVG(CASE WHEN COALESCE(failed_attempts,0) > 0 THEN courier_fee ELSE NULL END), 0) as avg_fee_multi_attempt,
        COUNT(*) as total_orders,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as total_delivered,
        SUM(CASE WHEN delivery_status = 'Delivered' AND COALESCE(failed_attempts,0) = 0 THEN 1 ELSE 0 END) as first_attempt_delivered,
        SUM(CASE WHEN delivery_status = 'Delivered' AND COALESCE(failed_attempts,0) > 0 THEN 1 ELSE 0 END) as failed_but_delivered,
        SUM(CASE WHEN delivery_status IN ('Returned', 'Return Received') AND COALESCE(failed_attempts,0) > 0 THEN 1 ELSE 0 END) as failed_and_returned
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY courier_name
      HAVING total_orders >= 3
      ORDER BY total_failed_attempts DESC
    `).all(...baseParams);

    // ── 8. Shipping Fee Recovery Analysis ────────────────────────────────────
    const shippingRecovery = db.prepare(`
      SELECT
        ${courierCase} as courier_name,
        COUNT(*) as total_orders,
        ROUND(AVG(COALESCE(shipping_fee, 0)), 0) as avg_shipping_charged,
        ROUND(AVG(COALESCE(courier_fee, 0)), 0) as avg_courier_cost,
        ROUND(SUM(COALESCE(shipping_fee, 0)), 0) as total_shipping_collected,
        ROUND(SUM(COALESCE(courier_fee, 0)), 0) as total_courier_paid,
        ROUND(SUM(COALESCE(shipping_fee, 0)) - SUM(COALESCE(courier_fee, 0)), 0) as net_shipping_pnl,
        SUM(CASE WHEN COALESCE(shipping_fee, 0) < COALESCE(courier_fee, 0) THEN 1 ELSE 0 END) as orders_underwater
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != '' ${dateFilter}
      GROUP BY courier_name
      HAVING total_orders >= 3
      ORDER BY net_shipping_pnl ASC
    `).all(...baseParams);

    // ── 9. City-level Avg Delivery Days ──────────────────────────────────────
    const cityDeliveryDays = db.prepare(`
      SELECT
        city,
        ${courierCase} as courier_name,
        COUNT(*) as delivered_count,
        ROUND(AVG(julianday(status_date) - julianday(order_date)), 1) as avg_days,
        MIN(CAST(julianday(status_date) - julianday(order_date) AS INTEGER)) as fastest_days,
        MAX(CAST(julianday(status_date) - julianday(order_date) AS INTEGER)) as slowest_days
      FROM orders
      WHERE store_id = ? AND delivery_status = 'Delivered'
        AND status_date IS NOT NULL AND order_date IS NOT NULL
        AND city IS NOT NULL AND city != ''
        AND julianday(status_date) > julianday(order_date)
        AND (julianday(status_date) - julianday(order_date)) <= 30
        ${dateFilter}
      GROUP BY city, courier_name
      HAVING delivered_count >= 5
      ORDER BY avg_days ASC
      LIMIT 40
    `).all(...baseParams);

    // ── 10. Courier Mix by Month ──────────────────────────────────────────────
    const courierMix = db.prepare(`
      SELECT
        substr(order_date, 1, 7) as month,
        ${courierCase} as courier_name,
        COUNT(*) as order_count,
        ROUND(SUM(courier_fee), 0) as total_fee,
        SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered
      FROM orders
      WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
        AND order_date >= date('now', '-6 months')
      GROUP BY month, courier_name
      ORDER BY month ASC, order_count DESC
    `).all(Number(store_id));

    res.json({
      costPerDelivery,
      returnLoss,
      profitByCourier,
      deadZoneCities,
      pendingExposure,
      weeklyTrend,
      failedAttemptCosts,
      shippingRecovery,
      cityDeliveryDays,
      courierMix
    });

  } catch (err) {
    console.error('Logistics Intelligence Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

