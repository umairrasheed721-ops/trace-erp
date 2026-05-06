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
    const couriers = db.prepare('SELECT DISTINCT courier FROM orders WHERE store_id = ? AND courier IS NOT NULL AND courier != ""').all(Number(store_id));
    res.json(couriers.map(c => c.courier));
  } catch (e) { 
    console.error('❌ GET /api/finance/couriers error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// POST /api/finance/repair-legacy
router.post('/repair-legacy', async (req, res) => {
  const { store_id, courier, daysOld, forceUnpaidAsReturned } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
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
    const params = [Number(store_id), dateStr];

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
        } else if (status.financial_status === 'refunded' || status.tags?.toLowerCase().includes('returned')) {
          newDelivery = 'Returned';
        } else if (status.financial_status === 'paid') {
          newDelivery = 'Delivered';
          newPayment = 'Paid';
        } else if (forceUnpaidAsReturned) {
          newDelivery = 'Returned';
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
    const orders = db.prepare('SELECT line_items, product_titles FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL) AND items_count > 0').all(Number(store_id));
    const productCounts = {};
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;

    console.log(`🔍 Scanning missing costs for Store ${store_id}. Orders found: ${orders.length}`);
    
    orders.forEach(o => {
      const itemsStr = o.line_items || o.product_titles;
      if (!itemsStr) return;
      
      let match;
      regex.lastIndex = 0; 
      while ((match = regex.exec(itemsStr)) !== null) {
        const fullName = match[1].trim();
        if (!fullName) continue;
        
        const parts = fullName.split(' - ');
        const parentName = parts[0].trim();
        const variantName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
        const qty = parseInt(match[2]) || 0;

        if (!productCounts[parentName]) {
          productCounts[parentName] = { name: parentName, count: 0, variants: {} };
        }
        productCounts[parentName].count += 1; // Number of orders
        
        if (!productCounts[parentName].variants[variantName]) {
          productCounts[parentName].variants[variantName] = { name: variantName, count: 0 };
        }
        productCounts[parentName].variants[variantName].count += 1;
      }
    });

    const list = Object.values(productCounts)
      .map(p => ({
        ...p,
        variants: Object.values(p.variants).sort((a,b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);

    console.log(`✅ Scan finished. Unique products: ${list.length}`);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/ghost-product-orders?store_id=1&name=Product%20Name
router.get('/ghost-product-orders', (req, res) => {
  const { store_id, name } = req.query;
  if (!store_id || !name) return res.status(400).json({ error: 'store_id and name required' });

  try {
    // We search for orders where the product name appears in line_items or product_titles
    // and the cost is 0 (unhealed)
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
              db.prepare(`UPDATE orders SET payment_status = ?, delivery_status = ?, courier_fee = ?, payment_ref = ?, paid_amount = ?, payment_date = ?, cost_locked = 1 WHERE id = ?`)
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

// POST /api/finance/apply-bulk-product-costs
router.post('/apply-bulk-product-costs', async (req, res) => {
  const { store_id, mappings } = req.body; // mappings: { "Product Name": 1200, ... }
  if (!store_id || !mappings) return res.status(400).json({ error: 'store_id and mappings required' });

  try {
    const orders = db.prepare('SELECT id, line_items, product_titles, delivery_status FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL OR cost_locked = 0) AND items_count > 0').all(Number(store_id));
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
    let healedCount = 0;

    console.log(`🚀 Healing costs for Store ${store_id}. Orders to check: ${orders.length}`);

    const updateStmt = db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = (CASE WHEN delivery_status IN (\'Delivered\', \'Return Received\') THEN 1 ELSE 0 END) WHERE id = ?');
    
    // 0. Load the full catalog for fallback matching
    const catalog = db.prepare('SELECT parent_title, variant_title, landed_cost, packaging_cost FROM product_master_costs WHERE store_id = ?').all(Number(store_id));

    db.transaction(() => {
      // 1. SYNC TO MASTER REGISTRY (Auto-learn)
      for (const [pName, pCost] of Object.entries(mappings)) {
        db.prepare(`
          INSERT INTO product_master_costs (store_id, parent_title, variant_title, unit_cost, landed_cost, updated_at)
          VALUES (?, ?, '', ?, ?, datetime('now'))
          ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
            unit_cost = excluded.unit_cost,
            landed_cost = excluded.landed_cost,
            updated_at = datetime('now')
        `).run(Number(store_id), pName, pCost, pCost);
      }

      // 2. Apply to zero-cost orders
      for (const order of orders) {
        const itemsStr = order.line_items || order.product_titles;
        if (!itemsStr) continue;

        let totalLanded = 0;
        let totalPackaging = 0;
        let hasNewMapping = false;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(itemsStr)) !== null) {
          const fullName = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          
          const parts = fullName.split(' - ');
          const pName = parts[0].trim();
          const vName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';

          // A. Try provided mappings first (New costs being learned)
          let unitPrice = mappings[fullName];
          if (unitPrice === undefined) unitPrice = mappings[pName];

          // B. Fallback to Master Registry (Existing costs)
          if (unitPrice === undefined) {
             let matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
             if (!matchRow) matchRow = catalog.find(c => c.parent_title === pName);
             if (matchRow) {
                unitPrice = matchRow.landed_cost;
                totalPackaging += (matchRow.packaging_cost || 0) * qty;
             }
          } else {
             hasNewMapping = true;
          }
          
          if (unitPrice !== undefined) {
            totalLanded += unitPrice * qty;
          }
        }

        // Only update if we actually applied one of the new mappings OR if the order was previously unhealed
        if (totalLanded > 0) {
          updateStmt.run(totalLanded, totalPackaging, order.id);
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
// 💎 MASTER COST MANAGER
// ==========================================

// GET /api/finance/master-costs?store_id=1
router.get('/master-costs', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  try {
    const costs = db.prepare('SELECT * FROM product_master_costs WHERE store_id = ? ORDER BY parent_title ASC, variant_title ASC').all(Number(store_id));
    res.json(costs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/master-costs
router.post('/master-costs', (req, res) => {
  const { store_id, parent_title, variant_title, unit_cost, packaging_cost } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const landed_cost = (parseFloat(unit_cost) || 0) + (parseFloat(packaging_cost) || 0);
    db.prepare(`
      INSERT INTO product_master_costs (store_id, parent_title, variant_title, unit_cost, packaging_cost, landed_cost, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
        unit_cost = excluded.unit_cost,
        packaging_cost = excluded.packaging_cost,
        landed_cost = excluded.landed_cost,
        updated_at = datetime('now')
    `).run(Number(store_id), parent_title, variant_title || '', unit_cost || 0, packaging_cost || 0, landed_cost);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/auto-heal-all
router.post('/auto-heal-all', (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const catalog = db.prepare('SELECT parent_title, variant_title, unit_cost, packaging_cost, landed_cost FROM product_master_costs WHERE store_id = ?').all(Number(store_id));
    
    const orders = db.prepare('SELECT id, line_items, product_titles FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL OR cost_locked = 0) AND items_count > 0').all(Number(store_id));
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
    let healedCount = 0;

    const updateStmt = db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = (CASE WHEN delivery_status IN (\'Delivered\', \'Return Received\') THEN 1 ELSE 0 END) WHERE id = ?');
    
    db.transaction(() => {
      for (const order of orders) {
        const itemsStr = order.line_items || order.product_titles;
        if (!itemsStr) continue;

        let totalLanded = 0;
        let totalPackaging = 0;
        let matched = false;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(itemsStr)) !== null) {
          const fullName = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          
          const parts = fullName.split(' - ');
          const pName = parts[0].trim();
          const vName = parts.length > 1 ? parts[1].trim() : '';
          
          // 1. Try Exact Match (Parent + Variant)
          let matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
          
          // 2. Fallback to Parent (empty variant) or any variant of that parent
          if (!matchRow) {
            matchRow = catalog.find(c => c.parent_title === pName);
          }
          
          if (matchRow) {
            totalLanded += matchRow.landed_cost * qty;
            totalPackaging += (matchRow.packaging_cost || 0) * qty;
            matched = true;
          }
        }

        if (matched) {
          updateStmt.run(totalLanded, totalPackaging, order.id);
          healedCount++;
        }
      }
    })();

    res.json({ success: true, count: healedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/sync-shopify-costs
router.post('/sync-shopify-costs', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { getShopifyInventoryCosts } = require('../engines/shopify_finance');
    const products = await getShopifyInventoryCosts(store);

    db.transaction(() => {
      for (const p of products) {
        // 1. Try to find by shopify_variant_id first (Fixes Renames!)
        let existing = null;
        if (p.shopify_variant_id) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND shopify_variant_id = ?').get(Number(store_id), p.shopify_variant_id);
        }

        // 2. If not found by ID, try by name (Handles legacy data transition)
        if (!existing) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?').get(Number(store_id), p.parent_name, p.variant_name);
        }

        if (existing) {
          // Update existing: Even if title changed, we update to latest title from Shopify
          db.prepare(`
            UPDATE product_master_costs SET
              shopify_variant_id = ?,
              parent_title = ?,
              variant_title = ?,
              shopify_cost = ?,
              selling_price = ?,
              inventory_qty = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(p.shopify_variant_id, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, existing.id);
        } else {
          // Insert new record
          db.prepare(`
            INSERT INTO product_master_costs (store_id, shopify_variant_id, parent_title, variant_title, shopify_cost, selling_price, inventory_qty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(Number(store_id), p.shopify_variant_id, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty);
        }
      }
    })();

    res.json({ success: true, count: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/accept-shopify-cost
router.post('/accept-shopify-cost', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost, 
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND variant_title = ?
    `).run(Number(store_id), parent_title, variant_title || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-sync-parent-costs
router.post('/bulk-sync-parent-costs', (req, res) => {
  const { store_id, parent_title, unit_cost, packaging_cost } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const landed_cost = (parseFloat(unit_cost) || 0) + (parseFloat(packaging_cost) || 0);
    db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = ?, packaging_cost = ?, landed_cost = ?, updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ?
    `).run(unit_cost || 0, packaging_cost || 0, landed_cost, Number(store_id), parent_title);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk-accept-shopify-costs', (req, res) => {
  try {
    const { store_id, parent_title } = req.body;
    if (!store_id || !parent_title) return res.status(400).json({ error: "Missing required fields" });

    const result = db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost,
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND shopify_cost > 0
    `).run(Number(store_id), parent_title);

    res.json({ success: true, message: `Accepted costs for ${result.changes} variants` });
  } catch (error) {
    console.error("Bulk Accept Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/revert-cost', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = previous_unit_cost,
          landed_cost = previous_unit_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND variant_title = ?
    `).run(Number(store_id), parent_title, variant_title || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk-revert-cost', (req, res) => {
  const { store_id, parent_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const result = db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = previous_unit_cost,
          landed_cost = previous_unit_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND previous_unit_cost > 0
    `).run(Number(store_id), parent_title);
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/delete-master-cost', (req, res) => {
  const { store_id, parent_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const result = db.prepare('DELETE FROM product_master_costs WHERE store_id = ? AND parent_title = ?')
      .run(Number(store_id), parent_title);
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==========================================
// 🛡️ PREVENTION & WATCHDOG API
// ==========================================
router.get('/prevention-audit', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    // 1. Missing Mapping (In Master Registry but cost is 0)
    const zeroCostInRegistry = db.prepare(`
      SELECT parent_title, variant_title, inventory_qty, landed_cost 
      FROM product_master_costs 
      WHERE store_id = ? AND (landed_cost = 0 OR landed_cost IS NULL)
      ORDER BY inventory_qty DESC
    `).all(Number(store_id));

    // 2. Pending Orders with Missing Cost (The actual risk)
    const pendingOrdersWithMissingCost = db.prepare(`
      SELECT id, shopify_order_id, customer_name, price, order_date 
      FROM orders 
      WHERE store_id = ? 
      AND (cost = 0 OR cost IS NULL)
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'RTO')
      AND order_date >= date('now', '-30 days')
      ORDER BY order_date DESC
    `).all(Number(store_id));

    // 3. New Shopify Variants not yet in registry
    // This requires a Shopify scan, but we can detect them if they appear in orders but not in master_costs
    // For now, we use a simple heuristic: any order with items that don't match anything in registry
    
    res.json({
      missingInRegistry: [], // Future: Implement live Shopify diff
      zeroCostInRegistry,
      pendingOrdersWithMissingCost
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 🧠 MARKETING INTELLIGENCE API
// ==========================================
router.get('/marketing-metrics', (req, res) => {
  const { store_id, days = 30 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const metrics = db.prepare(`
      SELECT * FROM daily_metrics 
      WHERE store_id = ? 
      AND date_string >= date('now', '-' || ? || ' days')
      ORDER BY date_string DESC
    `).all(Number(store_id), Number(days));
    res.json(metrics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/marketing-metrics', (req, res) => {
  const { store_id, date, meta_spend, google_spend, tiktok_spend } = req.body;
  if (!store_id || !date) return res.status(400).json({ error: 'store_id and date required' });

  try {
    const total = (parseFloat(meta_spend) || 0) + (parseFloat(google_spend) || 0) + (parseFloat(tiktok_spend) || 0);
    db.prepare(`
      INSERT INTO daily_metrics (store_id, date_string, marketing_spend, tiktok_marketing)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(store_id, date_string) DO UPDATE SET
        marketing_spend = excluded.marketing_spend,
        tiktok_marketing = excluded.tiktok_marketing
    `).run(Number(store_id), date, total, parseFloat(tiktok_spend) || 0);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
