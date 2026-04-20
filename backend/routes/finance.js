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

    for (const row of rows) {
      const inputId = String(row.orderId || '').replace(/\D/g, '');
      const inputTrack = String(row.trackingNumber || '').toLowerCase().replace(/\s+/g, '');
      
      if (!inputId && !inputTrack) continue;

      const type = String(row.type || '').toUpperCase().trim();
      const amount = parseFloat(row.codAmount) || 0;
      const charges = parseFloat(row.charges) || 0;
      const ref = row.ref || '';
      const dateStr = formatDate(row.date);

      let order = null;
      let isGhost = false;
      let needsAuditNote = false;

      if (masterKey === "Match by Tracking Number") {
        order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND LOWER(REPLACE(tracking_number, " ", "")) = ?').get(store_id, inputTrack);
        if (!order && inputId) {
          order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(store_id, inputId);
          if (order) needsAuditNote = true;
          else isGhost = true;
        } else if (!order) {
          isGhost = true;
        }
      } else { // Match by Order ID
        if (inputId) {
          order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(store_id, inputId);
          if (!order) isGhost = true;
        } else {
          isGhost = true;
        }
      }

      if (isGhost) {
        results.push({ ...row, status: '🛑 GHOST: Not in Database', recommendation: 'Manual Search Required', netPayout: 0, orderId: null });
        ghostCount++;
        continue;
      }

      if (needsAuditNote) {
        const noteText = `⚠️ [TRACE PK FINANCE]: Activity of Rs. ${amount || charges} reported in CPR Ref #${ref}. However, Tracking ID [${inputTrack}] was missing or mismatched in the ERP. Record NOT updated. Manual verification required.`;
        try {
          await appendShopifyNote(store, order.shopify_order_id, noteText);
          results.push({ ...row, status: '⚠️ CPR Note Added to Shopify', recommendation: 'Fix Tracking in Main Sheet', netPayout: 0, orderId: order.shopify_order_id });
        } catch (e) {
          results.push({ ...row, status: '⚠️ Tracking Mismatch', recommendation: 'API Error: Shopify ID invalid', netPayout: 0, orderId: order.shopify_order_id });
        }
        auditCount++;
        continue;
      }

      // Standard Processing
      if (type === 'D') {
        if (order.payment_status === 'Paid' || order.payment_status === 'Payment Posted') {
          results.push({ ...row, status: '🛑 Skipped', recommendation: 'Already Paid', netPayout: 0, orderId: order.shopify_order_id });
          continue;
        }

        try {
          const financials = await getShopifyFinancials(store, order.shopify_order_id);
          let balance = Math.round((financials.total_price - financials.total_received) * 100) / 100;
          let roundedAmount = Math.round(amount * 100) / 100;

          if (roundedAmount > balance) {
            results.push({ ...row, status: '🛑 Skipped', recommendation: `Input (${amount}) > Balance (${balance})`, netPayout: 0, orderId: order.shopify_order_id });
          } else {
            await captureShopifyPayment(store, order.shopify_order_id, amount);
            const noteText = ` | 💰 COD Rec: ${dateStr} | Ref: ${ref} | Amt: ${amount}`;
            await appendShopifyNote(store, order.shopify_order_id, noteText);
            
            db.prepare(`UPDATE orders SET payment_status = ?, delivery_status = ?, courier_fee = ?, payment_ref = ?, paid_amount = ?, payment_date = ? WHERE id = ?`)
              .run('Paid', 'Delivered', charges, ref, amount, dateStr, order.id);
              
            const rec = (roundedAmount < balance) ? "⚠️ Partial Payment" : "✅ Full Payment";
            results.push({ ...row, status: '✅ Done', recommendation: rec, netPayout: amount - charges, orderId: order.shopify_order_id });
            processedCount++;
          }
        } catch (e) {
          results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0, orderId: order.shopify_order_id });
        }
      } else if (type === 'R') {
        try {
          const noteText = ` | ↩️ Return Charged: ${dateStr} | Ref: ${ref} | Fee: ${charges}`;
          await appendShopifyNote(store, order.shopify_order_id, noteText);
          
          let delStatus = order.delivery_status;
          if (delStatus !== 'Return Received') delStatus = 'Returned';

          db.prepare('UPDATE orders SET delivery_status = ?, courier_fee = ? WHERE id = ?').run(delStatus, charges, order.id);
          
          results.push({ ...row, status: '✅ Done', recommendation: 'Return Fee Recorded', netPayout: -charges, orderId: order.shopify_order_id });
          processedCount++;
        } catch (e) {
          results.push({ ...row, status: '❌ API Error', recommendation: e.message, netPayout: 0, orderId: order.shopify_order_id });
        }
      } else {
        results.push({ ...row, status: '⚠️ Invalid Type', recommendation: "Use 'D' or 'R'", netPayout: 0, orderId: order.shopify_order_id });
      }
    }

    res.json({ success: true, results, summary: { processedCount, ghostCount, auditCount } });
  } catch (err) {
    console.error('Finance Bulk Update Error:', err);
    res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
});

module.exports = router;
