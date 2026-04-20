const express = require('express');
const router = express.Router();
const db = require('../db');
const { 
  getPrimaryLocationId, 
  processSmartRestock, 
  appendShopifyNote, 
  addShopifyTag, 
  getShopifyFinancials, 
  captureShopifyPayment 
} = require('../engines/shopify_finance');

function formatDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  return isNaN(d) ? dStr : d.toISOString().split('T')[0];
}

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
  const { store_id, rows, masterKey } = req.body;
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

          if (type === 'D') {
            if (order.payment_status === 'Paid' || order.payment_status === 'Payment Posted') {
              results.push({ ...row, status: '🛑 Skipped', recommendation: 'Already Paid', netPayout: 0, courierName: order.courier });
              continue;
            }

            try {
              const financials = await getShopifyFinancials(store, order.shopify_order_id);
              let balance = Math.round((financials.total_price - financials.total_received) * 100) / 100;
              if (amount > balance) {
                results.push({ ...row, status: '🛑 Skipped', recommendation: `Amt > Bal`, netPayout: 0, courierName: order.courier, balance });
              } else {
                await captureShopifyPayment(store, order.shopify_order_id, amount);
                combinedNotes.push(` | 💰 COD Rec: ${dateStr} | Ref: ${ref} | Amt: ${amount}`);
                
                db.prepare(`UPDATE orders SET payment_status = ?, delivery_status = ?, courier_fee = ?, payment_ref = ?, paid_amount = ?, payment_date = ? WHERE id = ?`)
                  .run('Paid', 'Delivered', charges, ref, amount, dateStr, order.id);
                  
                results.push({ ...row, status: '✅ Done', recommendation: (amount < balance ? "⚠️ Partial" : "✅ Full"), netPayout: amount - charges, courierName: order.courier, balance, chargesTrick, taxAddOn, finalCharges });
                processedCount++;
              }
            } catch (e) {
              results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
            }
          } else if (type === 'R') {
            try {
              combinedNotes.push(` | ↩️ Return Charged: ${dateStr} | Ref: ${ref} | Fee: ${charges}`);
              
              let delStatus = order.delivery_status;
              if (delStatus !== 'Return Received') delStatus = 'Returned';
              db.prepare('UPDATE orders SET delivery_status = ?, courier_fee = ? WHERE id = ?').run(delStatus, charges, order.id);
              
              results.push({ ...row, status: '✅ Done', recommendation: 'Return Fee Recorded', netPayout: -charges, courierName: order.courier, chargesTrick, taxAddOn, finalCharges });
              processedCount++;
            } catch (e) {
              results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
            }
          } else {
            results.push({ ...row, status: '⚠️ Invalid Type', recommendation: "Use 'D' or 'R'" });
          }
        }

        // Bulk apply all notes for this order in one shot
        if (combinedNotes.length > 0) {
          try {
            await appendShopifyNote(store, order.shopify_order_id, combinedNotes.join('\n'));
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

module.exports = router;
