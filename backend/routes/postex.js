const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { db, DB_DIR } = require('../db');
const { writeTrackingToShopify } = require('../scripts/trackingReconciler');

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath = path.join(DB_DIR, 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    cb(null, `patch_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/postex/manual-patch
 * Accepts CSV/Excel files containing Reference Number and Tracking Number columns.
 * Updates local database and triggers Shopify write-back.
 */
router.post('/manual-patch', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  
  try {
    // 1. Read sheet workbook using xlsx
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty' });
    }

    // 2. Identify the Reference Number and Tracking Number columns from the first row
    const { refKey, trackKey } = findColumns(rows[0]);

    if (!refKey || !trackKey) {
      return res.status(400).json({
        error: `Could not identify required columns. Checked headers: ${Object.keys(rows[0]).join(', ')}. Please ensure the sheet has columns matching "Reference Number" and "Tracking Number".`
      });
    }

    console.log(`[Manual Patch] Detected columns: Reference Key = "${refKey}", Tracking Key = "${trackKey}"`);

    let patchedCount = 0;
    const errors = [];

    // Load active stores for Shopify auth lookup
    const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();

    for (const row of rows) {
      const orderRef = String(row[refKey] || '').trim();
      const trackingNumber = String(row[trackKey] || '').trim();

      if (!orderRef || !trackingNumber) continue;

      try {
        // Find matching order in the current tenant database
        const order = db.prepare("SELECT * FROM orders WHERE ref_number = ?").get(orderRef);
        
        if (!order) {
          errors.push({ ref: orderRef, error: 'Order not found in ERP' });
          continue;
        }

        // Retrieve the store credentials
        const store = stores.find(s => s.id === order.store_id);
        if (!store) {
          errors.push({ ref: orderRef, error: 'Associated store credentials not found' });
          continue;
        }

        // Update local database order table
        db.prepare(`
          UPDATE orders 
          SET tracking_number = ?, courier = 'PostEx', status_date = datetime('now')
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
        `).run(order.id, orderRef, 'resolved');

        // Shopify Dual Write-back
        try {
          console.log(`[Manual Patch] Syncing tracking ${trackingNumber} for order ${orderRef} to Shopify...`);
          await writeTrackingToShopify(store, order.shopify_order_id, trackingNumber);
          patchedCount++;
        } catch (shopifyErr) {
          console.warn(`[Manual Patch] Shopify sync failed for order ${orderRef}: ${shopifyErr.message}`);
          db.prepare(`
            UPDATE tracking_reconciliation_logs 
            SET error_message = ?
            WHERE order_id = ?
          `).run(`Shopify sync failed: ${shopifyErr.message}`, order.id);
          // Still count as patched locally, but log the Shopify sync failure
          patchedCount++;
        }
      } catch (rowErr) {
        console.error(`[Manual Patch] Row processing failed for ref ${orderRef}:`, rowErr.message);
        errors.push({ ref: orderRef, error: rowErr.message });
      }
    }

    // Cleanup temp file safely
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}

    res.json({
      success: true,
      patchedCount,
      totalRows: rows.length,
      errors
    });

  } catch (err) {
    console.error('[Manual Patch] Critical parsing error:', err.message);
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
    res.status(500).json({ error: `File processing failed: ${err.message}` });
  }
});

function findColumns(row) {
  let refKey = null;
  let trackKey = null;
  
  const refRegex = /^(ref_number|reference_number|reference|order_ref|order_id|order_number|shopify_order_id|ref\s*#|order\s*#)$/i;
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
      if (cleanKey.includes('ref') || cleanKey.includes('orderid') || cleanKey.includes('order num') || cleanKey.includes('shopify')) {
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
