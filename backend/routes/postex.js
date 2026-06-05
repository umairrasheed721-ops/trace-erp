const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { db } = require('../db');
const { writeTrackingToShopify } = require('../scripts/trackingReconciler');

// Multer memory storage config
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/postex/manual-patch
 * Accepts single .xlsx file in memory, parses it, and patches orders with tracking numbers.
 */
router.post('/manual-patch', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // 1. Read sheet workbook using xlsx in memory
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded Excel file is empty' });
    }

    // 2. Identify columns (Order ID/Reference & Tracking Number) from the first row
    const { refKey, trackKey } = findColumns(rows[0]);

    if (!refKey || !trackKey) {
      return res.status(400).json({
        error: `Could not identify required columns. Checked headers: ${Object.keys(rows[0]).join(', ')}. Please ensure the sheet has columns named "Order ID" (or Reference) and "Tracking Number".`
      });
    }

    console.log(`[Manual Patch] Detected columns: Reference/Order ID Key = "${refKey}", Tracking Key = "${trackKey}"`);

    let patchedCount = 0;
    const errors = [];

    // Load active stores for Shopify auth lookup
    const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();

    for (const row of rows) {
      const orderIdVal = String(row[refKey] || '').trim();
      const trackingNumber = String(row[trackKey] || '').trim();

      if (!orderIdVal || !trackingNumber) continue;

      try {
        // Find matching order in the current tenant database (fuzzy match on ref_number or shopify_order_id)
        let order = db.prepare("SELECT * FROM orders WHERE ref_number = ?").get(orderIdVal);
        if (!order) {
          order = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(orderIdVal);
        }

        if (!order) {
          errors.push({ id: orderIdVal, error: 'Order not found in ERP' });
          continue;
        }

        // Retrieve store credentials
        const store = stores.find(s => s.id === order.store_id);
        if (!store) {
          errors.push({ id: orderIdVal, error: 'Associated store credentials not found' });
          continue;
        }

        // 3. Database & Shopify Logic: Update local SQLite database
        db.prepare(`
          UPDATE orders 
          SET tracking_number = ?, courier = 'PostEx', delivery_status = 'Dispatched/In Transit', status_date = datetime('now')
          WHERE id = ?
        `).run(trackingNumber, order.id);

        // Update or insert into tracking_reconciliation_logs
        db.prepare(`
          INSERT INTO tracking_reconciliation_logs (order_id, order_ref, status, error_message, last_attempted_at, resolved_at)
          VALUES (?, ?, ?, NULL, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
          ON CONFLICT(order_id) DO UPDATE SET
            status = excluded.status,
            error_message = NULL,
            last_attempted_at = excluded.last_attempted_at,
            resolved_at = excluded.resolved_at
        `).run(order.id, order.ref_number || orderIdVal, 'resolved');

        // Immediately after the DB update, trigger the Shopify Fulfillment API for that specific order
        // Wrapping in its own try...catch block inside the loop so that if one order fails to sync with Shopify, it doesn't crash the entire batch process.
        try {
          console.log(`[Manual Patch] Syncing tracking ${trackingNumber} for order ${order.ref_number || orderIdVal} to Shopify...`);
          await writeTrackingToShopify(store, order.shopify_order_id, trackingNumber);
          patchedCount++;
        } catch (shopifyErr) {
          console.warn(`[Manual Patch] Shopify sync failed for order ID ${orderIdVal}: ${shopifyErr.message}`);
          db.prepare(`
            UPDATE tracking_reconciliation_logs 
            SET error_message = ?
            WHERE order_id = ?
          `).run(`Shopify sync failed: ${shopifyErr.message}`, order.id);
          // Count as patched locally since SQLite update succeeded
          patchedCount++;
        }
      } catch (rowErr) {
        console.error(`[Manual Patch] Row processing failed for ID ${orderIdVal}:`, rowErr.message);
        errors.push({ id: orderIdVal, error: rowErr.message });
      }
    }

    res.json({
      success: true,
      patchedCount,
      totalRows: rows.length,
      errors
    });

  } catch (err) {
    console.error('[Manual Patch] Critical parsing error:', err.message);
    res.status(500).json({ error: `File processing failed: ${err.message}` });
  }
});

function findColumns(row) {
  let refKey = null;
  let trackKey = null;
  
  // Fuzzy column matches for Order ID, Reference, and Tracking Number
  const refRegex = /^(order_id|orderid|ref|reference|ref_number|reference_number|order_ref|order_number|shopify_order_id|ref\s*#|order\s*#)$/i;
  const trackRegex = /^(tracking_number|tracking_no|tracking|tracking_id|consignment_number|consignment_no|cn|cn_number|trackingno)$/i;

  const keys = Object.keys(row);

  for (const key of keys) {
    const cleanKey = key.trim();
    if (!refKey && refRegex.test(cleanKey)) {
      refKey = key;
    }
    if (!trackKey && trackRegex.test(cleanKey)) {
      trackKey = key;
    }
  }

  if (!refKey) {
    for (const key of keys) {
      const cleanKey = key.toLowerCase();
      if (cleanKey.includes('order') || cleanKey.includes('ref') || cleanKey.includes('shopify')) {
        refKey = key;
        break;
      }
    }
  }
  if (!trackKey) {
    for (const key of keys) {
      const cleanKey = key.toLowerCase();
      if (cleanKey.includes('track') || cleanKey.includes('consign') || cleanKey.includes('cn')) {
        trackKey = key;
        break;
      }
    }
  }

  return { refKey, trackKey };
}

module.exports = router;
