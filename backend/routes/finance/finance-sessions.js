const express = require('express');
const router = express.Router();
const db = require('../../db');
const crypto = require('crypto');
const { 
  appendShopifyNote, 
  getShopifyFinancials, 
  captureShopifyPayment,
  removeShopifyNoteLine
} = require('../../engines/shopify_finance');
const asyncHandler = require('../../middleware/async');
const FinanceService = require('../../services/FinanceService');

function formatDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  return isNaN(d) ? dStr : d.toISOString().split('T')[0];
}

// GET /api/finance/couriers?store_id=1
router.get('/couriers', async (req, res) => {
  try {
    const { store_id } = req.query;
    const couriers = FinanceService.getCouriers(store_id);
    res.json({ success: true, data: couriers, message: 'Couriers retrieved successfully' });
  } catch (err) {
    console.error('[CourierFinanceRoute Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/sync-status
router.get('/sync-status', (req, res) => {
  const tenantId = req.tenantId || 'default';
  global.activeSyncs = global.activeSyncs || {};
  const status = global.activeSyncs[tenantId] || { shopify: false, courier: false };
  res.json({ success: true, ...status });
});

// GET /api/finance/ghost-product-orders?store_id=1&name=Product%20Name
router.get('/ghost-product-orders', (req, res) => {
  const { store_id, name } = req.query;
  if (!store_id || !name) return res.status(400).json({ error: 'store_id and name required' });

  try {
    const orders = db.prepare(`
      SELECT id, shopify_order_id, ref_number, customer_name, order_date, price, delivery_status, product_titles
      FROM orders 
      WHERE store_id = ? 
      AND (cost = 0 OR cost IS NULL)
      AND (line_items LIKE ? OR product_titles LIKE ?)
      ORDER BY order_date DESC
      LIMIT 100
    `).all(Number(store_id), `%${name}%`, `%${name}%`);

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/bulk-update
router.post('/bulk-update', async (req, res) => {
  const { store_id, rows, masterKey, syncToShopify, session_id } = req.body;
  if (!store_id || !rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const results = [];
    let ghostCount = 0;
    let auditCount = 0;
    let processedCount = 0;

    let sessionId = session_id;
    if (!sessionId) {
      const sessionResult = db.prepare('INSERT INTO recon_sessions (store_id, filename, row_count, sync_to_shopify) VALUES (?, ?, ?, ?)').run(store_id, req.body.filename || 'Manual Upload', req.body.total_rows || rows.length, syncToShopify ? 1 : 0);
      sessionId = sessionResult.lastInsertRowid;
    }

    const ordersToProcess = {};
    for (const row of rows) {
      const inputId = String(row.orderId || '').replace(/\D/g, '');
      const inputTrack = String(row.trackingNumber || '').toLowerCase().replace(/\s+/g, '');
      if (!inputId && !inputTrack) continue;

      let order = null;
      if (masterKey === "Match by Tracking Number") {
        order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND LOWER(REPLACE(tracking_number, \' \', \'\')) = ?').get(store_id, inputTrack);
        if (!order && (row.orderId || row.trackingNumber)) {
          const rawId = String(row.orderId || '').trim();
          const cleanDigits = rawId.replace(/\D/g, '');
          const candidates = Array.from(new Set([
            rawId,
            cleanDigits,
            cleanDigits ? 'TR' + cleanDigits : null,
            cleanDigits ? '#' + cleanDigits : null
          ].filter(Boolean)));

          if (candidates.length > 0) {
            const placeholders = candidates.map(() => '?').join(',');
            order = db.prepare(`
              SELECT * FROM orders 
              WHERE store_id = ? 
              AND (shopify_order_id IN (${placeholders}) OR ref_number IN (${placeholders}))
              LIMIT 1
            `).get(store_id, ...candidates, ...candidates);
          }
        }
      } else {
        const rawId = String(row.orderId || '').trim();
        const cleanDigits = rawId.replace(/\D/g, '');
        const candidates = Array.from(new Set([
          rawId,
          cleanDigits,
          cleanDigits ? 'TR' + cleanDigits : null,
          cleanDigits ? '#' + cleanDigits : null
        ].filter(Boolean)));

        if (candidates.length > 0) {
          const placeholders = candidates.map(() => '?').join(',');
          order = db.prepare(`
            SELECT * FROM orders 
            WHERE store_id = ? 
            AND (shopify_order_id IN (${placeholders}) OR ref_number IN (${placeholders}))
            LIMIT 1
          `).get(store_id, ...candidates, ...candidates);
        }
      }

      if (!order) {
        results.push({ ...row, status: '🛑 GHOST: Not in Database', recommendation: 'Manual Search Required', netPayout: 0 });
        ghostCount++;
        continue;
      }

      if (!ordersToProcess[order.id]) {
        ordersToProcess[order.id] = { order, rows: [], notes: [] };
      }
      ordersToProcess[order.id].rows.push(row);
    }

    for (const orderIdKey in ordersToProcess) {
      const { order, rows: orderRows } = ordersToProcess[orderIdKey];
      const combinedNotes = [];
      
      for (const row of orderRows) {
        const type = String(row.type || '').toUpperCase().trim();
        const amount = parseFloat(row.codAmount) || 0;
        const charges = parseFloat(row.charges) || 0;
        const ref = String(row.ref || '').trim();
        const dateStr = formatDate(row.date);

        const chargesTrick = order.courier_fee || 0;
        const taxAddOn = Math.round((charges * 0.04) * 100) / 100;
        const finalCharges = Math.round((chargesTrick + taxAddOn) * 100) / 100;

        const logData = {
          session_id: sessionId,
          order_id: order.id,
          old_delivery_status: order.delivery_status,
          old_payment_status: order.payment_status,
          old_courier_fee: order.courier_fee,
          old_paid_amount: order.paid_amount,
          old_payment_ref: order.payment_ref,
          old_payment_date: order.payment_date,
          shopify_note_added: null
        };

        if (type === 'D') {
          try {
            let balance = 0;
            let alreadyPaidInERP = (order.payment_status === 'Paid' || order.payment_status === 'Payment Posted');
            
            if (syncToShopify) {
              const financials = await getShopifyFinancials(store, order.shopify_order_id);
              balance = Math.round((financials.total_price - financials.total_received) * 100) / 100;
            }

            const shouldCapture = syncToShopify && !alreadyPaidInERP && amount <= balance && amount > 0;

            if (shouldCapture) {
              await captureShopifyPayment(store, order.shopify_order_id, amount);
              combinedNotes.push(` | 💰 COD Rec: ${dateStr} | Ref: ${ref} | Amt: ${amount}`);
            }

            let finalCourierFee = charges;
            if (order.courier_fee > 0 && (order.courier === 'TCS' || order.courier === 'Leopards' || order.courier === 'LCS' || String(order.courier).toLowerCase().includes('insta'))) {
              finalCourierFee = order.courier_fee + charges;
            }

            db.prepare(`UPDATE orders SET payment_status = ?, delivery_status = ?, courier_fee = ?, payment_ref = ?, paid_amount = ?, payment_date = ?, cost_locked = 1 WHERE id = ?`)
              .run('Paid', 'Delivered', finalCourierFee, ref, amount, dateStr, order.id);
              
            const rec = !syncToShopify ? "✅ ERP Recorded" : (shouldCapture ? "✅ Full Sync" : "✅ ERP Updated (Shopify Skipped)");
            results.push({ ...row, status: '✅ Done', recommendation: rec, netPayout: amount - charges, courierName: order.courier, balance, chargesTrick, taxAddOn, finalCharges });
            processedCount++;

            db.prepare(`INSERT INTO recon_logs (session_id, order_id, old_delivery_status, old_payment_status, old_courier_fee, old_paid_amount, old_payment_ref, old_payment_date) VALUES (?,?,?,?,?,?,?,?)`)
              .run(sessionId, order.id, logData.old_delivery_status, logData.old_payment_status, logData.old_courier_fee, logData.old_paid_amount, logData.old_payment_ref, logData.old_payment_date);
            
          } catch (e) {
            results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
          }
        } else if (type === 'R') {
          try {
            if (syncToShopify) {
              combinedNotes.push(` | ↩️ Return Charged: ${dateStr} | Ref: ${ref} | Fee: ${charges}`);
            }
            
            let delStatus = order.delivery_status;
            if (delStatus !== 'Return Received') delStatus = 'Returned';

            let finalCourierFee = charges;
            if (order.courier_fee > 0 && (order.courier === 'TCS' || order.courier === 'Leopards' || order.courier === 'LCS' || String(order.courier).toLowerCase().includes('insta'))) {
              finalCourierFee = order.courier_fee + charges;
            }

            db.prepare('UPDATE orders SET delivery_status = ?, courier_fee = ?, payment_status = ?, paid_amount = ? WHERE id = ?')
              .run(delStatus, finalCourierFee, 'Returned', 0, order.id);
            
            results.push({ ...row, status: '✅ Done', recommendation: 'Return Fee Recorded', netPayout: -charges, courierName: order.courier, chargesTrick, taxAddOn, finalCharges });
            processedCount++;

            db.prepare(`INSERT INTO recon_logs (session_id, order_id, old_delivery_status, old_payment_status, old_courier_fee, old_paid_amount, old_payment_ref, old_payment_date) VALUES (?,?,?,?,?,?,?,?)`)
              .run(sessionId, order.id, logData.old_delivery_status, logData.old_payment_status, logData.old_courier_fee, logData.old_paid_amount, logData.old_payment_ref, logData.old_payment_date);
          } catch (e) {
            results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
          }
        } else {
          results.push({ ...row, status: '⚠️ Invalid Type', recommendation: "Use 'D' or 'R'" });
        }
      }

      if (syncToShopify && combinedNotes.length > 0) {
        try {
          const addedNote = await appendShopifyNote(store, order.shopify_order_id, combinedNotes.join('\n'));
          if (addedNote) {
            db.prepare('UPDATE recon_logs SET shopify_note_added = ? WHERE session_id = ? AND order_id = ?').run(addedNote, sessionId, order.id);
          }
        } catch (e) {
          console.error(`Failed to append notes for ${order.shopify_order_id}:`, e);
        }
      }
    }

    res.json({ success: true, sessionId, results, summary: { processedCount, ghostCount, auditCount } });
  } catch (err) {
    console.error('Finance Bulk Update Error:', err);
    res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
});

// GET /api/finance/reconciliation-history?store_id=1
router.get('/reconciliation-history', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const history = db.prepare('SELECT * FROM recon_sessions WHERE store_id = ? ORDER BY created_at DESC LIMIT 50').all(store_id);
  res.json(history);
});

// POST /api/finance/reconciliation-undo
router.post('/reconciliation-undo', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  try {
    const session = db.prepare('SELECT * FROM recon_sessions WHERE id = ?').get(session_id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(session.store_id);
    const logs = db.prepare('SELECT * FROM recon_logs WHERE session_id = ?').all(session_id);

    for (const log of logs) {
      db.prepare(`
        UPDATE orders 
        SET delivery_status = ?, payment_status = ?, courier_fee = ?, paid_amount = ?, payment_ref = ?, payment_date = ?
        WHERE id = ?
      `).run(log.old_delivery_status, log.old_payment_status, log.old_courier_fee, log.old_paid_amount, log.old_payment_ref, log.old_payment_date, log.order_id);

      if (session.sync_to_shopify && log.shopify_note_added) {
        const order = db.prepare('SELECT shopify_order_id FROM orders WHERE id = ?').get(log.order_id);
        if (order) {
          try {
            await removeShopifyNoteLine(store, order.shopify_order_id, log.shopify_note_added);
          } catch (e) { console.error(`Failed to revert Shopify note for ${order.shopify_order_id}`, e); }
        }
      }
    }

    db.prepare('DELETE FROM recon_sessions WHERE id = ?').run(session_id);
    res.json({ success: true, count: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/reconciliation-clear
router.post('/reconciliation-clear', (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  try {
    db.prepare('DELETE FROM recon_logs WHERE session_id = ?').run(Number(session_id));
    db.prepare('DELETE FROM recon_sessions WHERE id = ?').run(Number(session_id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/create-ghost-order
router.post('/create-ghost-order', async (req, res) => {
  const { store_id, tracking_number, order_id_ref, amount, courier_fee, date } = req.body;
  if (!store_id || !tracking_number) return res.status(400).json({ error: 'store_id and tracking_number required' });

  try {
    const existing = db.prepare('SELECT id FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, tracking_number);
    if (existing) return res.json({ success: true, message: 'Already exists' });

    db.prepare(`
      INSERT INTO orders (
        store_id, shopify_order_id, ref_number, customer_name, order_date, 
        price, tracking_number, delivery_status, payment_status, 
        courier_fee, paid_amount, payment_date, order_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id, 
      order_id_ref || ('GHOST-' + Date.now()), 
      order_id_ref || 'GHOST',
      'GHOST CUSTOMER',
      date || new Date().toISOString().split('T')[0],
      amount,
      tracking_number,
      'Delivered',
      'Paid',
      courier_fee || 0,
      amount,
      date || new Date().toISOString().split('T')[0],
      'Manual / Ghost'
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/fetch-live-payouts
router.get('/fetch-live-payouts', async (req, res) => {
  const { store_id, courier, cpr } = req.query;
  if (!store_id || !cpr) return res.status(400).json({ error: 'store_id and cpr required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(404).json({ error: 'Store not found' });

    let liveOrders = [];
    let usedLiveApi = false;

    if (courier === 'PostEx' && store.postex_token && !store.postex_token.includes('****')) {
      try {
        const fetch = require('node-fetch');
        const response = await fetch(`https://api.postex.pk/services/integration/api/order/v1/payout?cprNumber=${encodeURIComponent(cpr)}`, {
          headers: { 'token': store.postex_token },
          timeout: 10000
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.dist && Array.isArray(data.dist)) {
            liveOrders = data.dist.map(row => {
              const ref = row.orderRefNumber || row.orderRef || '';
              const track = row.trackingNumber || '';
              const status = String(row.status || '').toLowerCase().includes('delivered') ? 'D' : 'R';
              const cod = parseFloat(row.codAmount || row.invoicePayment || 0);
              const ship = parseFloat(row.shippingCharges || 0);
              const gst = parseFloat(row.gst || 0);
              const incomeTax = parseFloat(row.whIncomeTax || 0);
              const salesTax = parseFloat(row.whSalesTax || 0);
              const totalExpense = ship + gst + incomeTax + salesTax;

              return {
                'Order ID': String(ref).trim(),
                'Tracking Number': String(track).trim(),
                'Status': status,
                'Amount Collected': status === 'D' ? cod : 0,
                'Total Expense': totalExpense.toFixed(2),
                'CPR Reference': cpr.trim(),
                'Settlement Date': new Date().toISOString().split('T')[0]
              };
            }).filter(r => r['Order ID']);
            if (liveOrders.length > 0) usedLiveApi = true;
          }
        }
      } catch (err) {
        console.warn('PostEx live fetch failed/unavailable, falling back to simulation:', err.message);
      }
    }

    if (!usedLiveApi) {
      let dbOrders = db.prepare(`
        SELECT shopify_order_id, ref_number, tracking_number, delivery_status, price, courier_fee 
        FROM orders WHERE store_id = ? AND payment_ref = ?
      `).all(Number(store_id), cpr);

      if (dbOrders.length === 0) {
        dbOrders = db.prepare(`
          SELECT shopify_order_id, ref_number, tracking_number, delivery_status, price, courier_fee 
          FROM orders 
          WHERE store_id = ? AND (payment_status != 'Paid' OR payment_status IS NULL)
          AND delivery_status IN ('Delivered', 'Shipped', 'In Transit')
          LIMIT 8
        `).all(Number(store_id));
      }

      liveOrders = dbOrders.map(ord => {
        const status = ord.delivery_status === 'Returned' ? 'R' : 'D';
        const cod = status === 'D' ? (parseFloat(ord.price) || 3500) : 0;
        const baseShip = parseFloat(ord.courier_fee) || 250;
        const gst = baseShip * 0.19;
        const incomeTax = cod * 0.02;
        const salesTax = cod * 0.02;
        const totalExpense = baseShip + gst + incomeTax + salesTax;

        return {
          'Order ID': ord.ref_number || ord.shopify_order_id || 'TR' + Math.floor(Math.random()*10000),
          'Tracking Number': ord.tracking_number || 'PEX' + Math.floor(Math.random()*10000000),
          'Status': status,
          'Amount Collected': cod,
          'Total Expense': totalExpense.toFixed(2),
          'CPR Reference': cpr.trim(),
          'Settlement Date': new Date().toISOString().split('T')[0]
        };
      });
    }

    res.json({
      success: true,
      source: usedLiveApi ? 'PostEx API' : 'ERP Simulation',
      cpr,
      count: liveOrders.length,
      orders: liveOrders
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/finance/lock-cpr
router.post('/lock-cpr', (req, res) => {
  const { store_id, courier, cpr, settlementDate, totalOrders, totalCod, totalExpense, netPayout, actualBankDeposit, discrepancyAmount, discrepancyReason, auditStatus, orders } = req.body;
  if (!store_id || !cpr || !orders) return res.status(400).json({ error: 'Missing required fields' });

  const executeLock = db.transaction(() => {
    const insertCpr = db.prepare(`
      INSERT INTO cpr_settlements (store_id, courier, cpr_reference, settlement_date, total_orders, total_cod, total_expense, net_payout, actual_bank_deposit, discrepancy_amount, discrepancy_reason, audit_status, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(store_id, courier, cpr_reference) DO UPDATE SET
        settlement_date = excluded.settlement_date,
        total_orders = excluded.total_orders,
        total_cod = excluded.total_cod,
        total_expense = excluded.total_expense,
        net_payout = excluded.net_payout,
        actual_bank_deposit = excluded.actual_bank_deposit,
        discrepancy_amount = excluded.discrepancy_amount,
        discrepancy_reason = excluded.discrepancy_reason,
        audit_status = excluded.audit_status,
        is_locked = 1
    `).run(
      Number(store_id), courier, cpr, settlementDate, totalOrders, totalCod, totalExpense, netPayout,
      parseFloat(actualBankDeposit) || 0, parseFloat(discrepancyAmount) || 0, discrepancyReason || null, auditStatus || 'CLEARED'
    );

    let cprId = insertCpr.lastInsertRowid;
    if (!cprId) {
      const existing = db.prepare('SELECT id FROM cpr_settlements WHERE store_id = ? AND courier = ? AND cpr_reference = ?').get(Number(store_id), courier, cpr);
      cprId = existing.id;
    }

    db.prepare('DELETE FROM cpr_settlement_orders WHERE cpr_id = ?').run(cprId);

    const insertOrd = db.prepare(`
      INSERT INTO cpr_settlement_orders (cpr_id, order_ref, tracking_number, status, amount_collected, total_expense, cpr_reference, settlement_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateMainOrdDelivered = db.prepare(`
      UPDATE orders 
      SET payment_status = 'Paid', delivery_status = 'Delivered', payment_ref = ?, paid_amount = ?, courier_fee = ?, payment_date = ?, cost_locked = 1 
      WHERE store_id = ? AND (tracking_number = ? OR shopify_order_id = ? OR ref_number = ?)
    `);

    const updateMainOrdReturned = db.prepare(`
      UPDATE orders 
      SET payment_status = 'Returned', delivery_status = CASE WHEN delivery_status = 'Return Received' THEN 'Return Received' ELSE 'Returned' END, payment_ref = ?, paid_amount = 0, courier_fee = ?, payment_date = ?, cost_locked = 1 
      WHERE store_id = ? AND (tracking_number = ? OR shopify_order_id = ? OR ref_number = ?)
    `);

    for (const ord of orders) {
      insertOrd.run(
        cprId, 
        ord['Order ID'], 
        ord['Tracking Number'], 
        ord['Status'], 
        ord['Amount Collected'], 
        ord['Total Expense'], 
        cpr, 
        settlementDate
      );

      if (ord['Status'] === 'R') {
        updateMainOrdReturned.run(
          cpr,
          ord['Total Expense'],
          settlementDate,
          Number(store_id),
          ord['Tracking Number'],
          ord['Order ID'],
          ord['Order ID']
        );
      } else {
        updateMainOrdDelivered.run(
          cpr,
          ord['Amount Collected'],
          ord['Total Expense'],
          settlementDate,
          Number(store_id),
          ord['Tracking Number'],
          ord['Order ID'],
          ord['Order ID']
        );
      }
    }
  });

  try {
    executeLock();
    res.json({ success: true, message: `CPR ${cpr} successfully locked and cleared!` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/finance/cpr-ledger
router.get('/cpr-ledger', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const ledger = db.prepare(`
      SELECT * FROM cpr_settlements 
      WHERE store_id = ? 
      ORDER BY created_at DESC
    `).all(Number(store_id));

    res.json(ledger);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
