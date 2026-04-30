const express = require('express');
const router = express.Router();
const db = require('../db');
const { 
  getPrimaryLocationId, 
  processSmartRestock, 
  appendShopifyNote, 
  addShopifyTag, 
  getShopifyFinancials, 
  captureShopifyPayment,
  removeShopifyNoteLine
} = require('../engines/shopify_finance');

function formatDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  return isNaN(d) ? dStr : d.toISOString().split('T')[0];
}

// ==========================================
// 🛠️ LEGACY DATA REPAIR
// ==========================================

// GET /api/finance/couriers?store_id=1
router.get('/couriers', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  try {
    const couriers = db.prepare('SELECT DISTINCT courier FROM orders WHERE store_id = ? AND courier IS NOT NULL AND courier != ""').all(store_id);
    res.json(couriers.map(c => c.courier));
  } catch (e) { 
    console.error('❌ GET /api/finance/couriers error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// POST /api/finance/repair-legacy
router.post('/repair-legacy', async (req, res) => {
  const { store_id, courier, daysOld } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - (parseInt(daysOld) || 30));
    const dateStr = dateLimit.toISOString().split('T')[0];

    let query = `
      SELECT id, shopify_order_id, delivery_status, payment_status 
      FROM orders 
      WHERE store_id = ? 
      AND order_date <= ? 
      AND delivery_status NOT IN ('Delivered', 'Cancelled', 'Returned', 'Return Received', 'RTO')
    `;
    const params = [store_id, dateStr];

    if (courier && courier !== 'All Inactive') {
      query += " AND courier = ?";
      params.push(courier);
    }

    const orders = db.prepare(query).all(...params);
    if (orders.length === 0) return res.json({ success: true, count: 0, message: 'No legacy orders found matching criteria.' });

    const { getShopifyOrderStatus } = require('../engines/shopify_finance');
    
    let healedCount = 0;
    for (const order of orders) {
      try {
        const status = await getShopifyOrderStatus(store, order.shopify_order_id);
        
        let newDelivery = order.delivery_status;
        let newPayment = order.payment_status;

        if (status.is_cancelled) {
          newDelivery = 'Cancelled';
        } else if (status.financial_status === 'refunded') {
          newDelivery = 'Returned';
        } else if (status.fulfillment_status === 'fulfilled' && status.financial_status === 'paid') {
          newDelivery = 'Delivered';
          newPayment = 'Paid';
        }

        if (newDelivery !== order.delivery_status || newPayment !== order.payment_status) {
          db.prepare('UPDATE orders SET delivery_status = ?, payment_status = ? WHERE id = ?').run(newDelivery, newPayment, order.id);
          healedCount++;
        }
      } catch (e) {
        console.error(`Repair failed for ${order.shopify_order_id}:`, e.message);
      }
    }

    res.json({ success: true, count: healedCount, totalChecked: orders.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/missing-product-list?store_id=1
router.get('/missing-product-list', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const orders = db.prepare('SELECT line_items FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL) AND items_count > 0').all(store_id);
    const productCounts = {};
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;

    orders.forEach(o => {
      if (!o.line_items) return;
      let match;
      // Reset regex index for each string
      regex.lastIndex = 0; 
      while ((match = regex.exec(o.line_items)) !== null) {
        const name = match[1].trim();
        if (!name) continue;
        productCounts[name] = (productCounts[name] || 0) + 1;
      }
    });

    const list = Object.entries(productCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/apply-bulk-product-costs
router.post('/apply-bulk-product-costs', async (req, res) => {
  const { store_id, mappings } = req.body; // mappings: { "Product Name": 1200, ... }
  if (!store_id || !mappings) return res.status(400).json({ error: 'store_id and mappings required' });

  try {
    const orders = db.prepare('SELECT id, line_items FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL) AND items_count > 0').all(store_id);
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
    let healedCount = 0;

    const updateStmt = db.prepare('UPDATE orders SET cost = ?, cost_locked = 1 WHERE id = ?');
    
    db.transaction(() => {
      for (const order of orders) {
        let totalCost = 0;
        let matched = false;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(order.line_items)) !== null) {
          const name = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          if (mappings[name] !== undefined) {
            totalCost += mappings[name] * qty;
            matched = true;
          }
        }

        if (matched) {
          updateStmt.run(totalCost, order.id);
          healedCount++;
        }
      }
    })();

    res.json({ success: true, count: healedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 📦 UNIFIED RETURNS MANAGER
// ==========================================
router.post('/returns', async (req, res) => {
  const { store_id, trackingNumbers, updateERP, restockShopify } = req.body;
  if (!store_id || !trackingNumbers || !Array.isArray(trackingNumbers)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  let shopifyLocationId = null;
  if (restockShopify) {
    try {
      shopifyLocationId = await getPrimaryLocationId(store);
    } catch (e) {
      return res.status(500).json({ error: 'Shopify Location Error: ' + e.message });
    }
  }

  const results = [];
  
  for (let track of trackingNumbers) {
    track = String(track).trim();
    if (!track) continue;

    const order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, track);
    
    if (!order) {
      results.push({ tracking: track, erpStatus: '❌ Not Found', shopifyStatus: '❌ Not Found' });
      continue;
    }

    let erpStatus = '⏭️ Skipped';
    if (updateERP) {
      if (order.delivery_status === 'Return Received') {
        erpStatus = '⚠️ Already Updated';
      } else {
        db.prepare('UPDATE orders SET delivery_status = ? WHERE id = ?').run('Return Received', order.id);
        erpStatus = '✅ Updated';
      }
    }

    let shopifyStatus = '⏭️ Skipped';
    if (restockShopify) {
      if (!order.shopify_order_id) {
        shopifyStatus = '❌ No Order ID';
      } else {
        try {
          shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
        } catch (e) {
          shopifyStatus = '❌ API Error: ' + e.message;
        }
      }
    }

    results.push({ tracking: track, erpStatus, shopifyStatus, orderId: order.shopify_order_id });
  }

  res.json({ success: true, results });
});


// ==========================================
// 💰 FINANCE & PAYMENTS HYBRID ENGINE
// ==========================================
router.post('/bulk-update', async (req, res) => {
  const { store_id, rows, masterKey, syncToShopify } = req.body;
  // rows expected format: { orderId, trackingNumber, type, codAmount, charges, ref, date }
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

    // Start a Reconciliation Session
    const sessionResult = db.prepare('INSERT INTO recon_sessions (store_id, filename, row_count, sync_to_shopify) VALUES (?, ?, ?, ?)').run(store_id, req.body.filename || 'Manual Upload', rows.length, syncToShopify ? 1 : 0);
    const sessionId = sessionResult.lastInsertRowid;

      // Group by Order to prevent race conditions and multiple Shopify calls for the same order
      const ordersToProcess = {};
      for (const row of rows) {
        const inputId = String(row.orderId || '').replace(/\D/g, '');
        const inputTrack = String(row.trackingNumber || '').toLowerCase().replace(/\s+/g, '');
        if (!inputId && !inputTrack) continue;

        let order = null;
        if (masterKey === "Match by Tracking Number") {
          order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND LOWER(REPLACE(tracking_number, \' \', \'\')) = ?').get(store_id, inputTrack);
          if (!order && inputId) order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(store_id, inputId);
        } else if (inputId) {
          order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(store_id, inputId);
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

          // XLOOKUP Style metrics
          const chargesTrick = order.courier_fee || 0;
          const taxAddOn = Math.round((charges * 0.04) * 100) / 100;
          const finalCharges = Math.round((chargesTrick + taxAddOn) * 100) / 100;

          // Snapshot for Undo
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

              // ALWAYS update internal ERP database with the actual settlement data
              db.prepare(`UPDATE orders SET payment_status = ?, delivery_status = ?, courier_fee = ?, payment_ref = ?, paid_amount = ?, payment_date = ? WHERE id = ?`)
                .run('Paid', 'Delivered', charges, ref, amount, dateStr, order.id);
                
              const rec = !syncToShopify ? "✅ ERP Recorded" : (shouldCapture ? "✅ Full Sync" : "✅ ERP Updated (Shopify Skipped)");
              results.push({ ...row, status: '✅ Done', recommendation: rec, netPayout: amount - charges, courierName: order.courier, balance, chargesTrick, taxAddOn, finalCharges });
              processedCount++;

              // Save snapshot
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
              db.prepare('UPDATE orders SET delivery_status = ?, courier_fee = ? WHERE id = ?').run(delStatus, charges, order.id);
              
              results.push({ ...row, status: '✅ Done', recommendation: 'Return Fee Recorded', netPayout: -charges, courierName: order.courier, chargesTrick, taxAddOn, finalCharges });
              processedCount++;

              // Save snapshot
              db.prepare(`INSERT INTO recon_logs (session_id, order_id, old_delivery_status, old_payment_status, old_courier_fee, old_paid_amount, old_payment_ref, old_payment_date) VALUES (?,?,?,?,?,?,?,?)`)
                .run(sessionId, order.id, logData.old_delivery_status, logData.old_payment_status, logData.old_courier_fee, logData.old_paid_amount, logData.old_payment_ref, logData.old_payment_date);
            } catch (e) {
              results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
            }
          } else {
            results.push({ ...row, status: '⚠️ Invalid Type', recommendation: "Use 'D' or 'R'" });
          }
        }

        // Bulk apply all notes for this order in one shot
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

    res.json({ success: true, results, summary: { processedCount, ghostCount, auditCount } });
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
      // Revert ERP
      db.prepare(`
        UPDATE orders 
        SET delivery_status = ?, payment_status = ?, courier_fee = ?, paid_amount = ?, payment_ref = ?, payment_date = ?
        WHERE id = ?
      `).run(log.old_delivery_status, log.old_payment_status, log.old_courier_fee, log.old_paid_amount, log.old_payment_ref, log.old_payment_date, log.order_id);

      // Revert Shopify Note
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

module.exports = router;
