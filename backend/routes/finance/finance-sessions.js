const express = require('express');
const router = express.Router();
const db = require('../../db');
const crypto = require('crypto');
const { 
  appendShopifyNote, 
  getShopifyFinancials, 
  captureShopifyPayment,
  removeShopifyNoteLine,
  markShopifyOrderDelivered
} = require('../../engines/shopify_finance');
const asyncHandler = require('../../middleware/async');
const FinanceService = require('../../services/FinanceService');

const PAYMENT_VARIANCE_TOLERANCE = 0.9; // Rule 22: Rs 0.9 tolerance for COD shortfall/surplus
const SHOPIFY_CAPTURE_TOLERANCE = 10.0; // Rs 10 capture rounding allowance

function parseAmount(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  const cleaned = String(val)
    .replace(/rs\.?|pkr/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/^\((.*)\)$/, '-$1')
    .trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(dStr) {
  if (!dStr) return '';
  const raw = String(dStr).trim();
  // Support Pakistani DD/MM/YYYY or DD-MM-YYYY explicitly to prevent month/day inversion
  const pkMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (pkMatch) {
    const day = Number(pkMatch[1]);
    const month = Number(pkMatch[2]);
    let year = Number(pkMatch[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toISOString().split('T')[0];
}

function getOrderMatchingCandidates(rawId) {
  if (!rawId) return [];
  const str = String(rawId).trim();
  if (!str) return [];

  const upper = str.toUpperCase();
  const candidates = new Set();

  candidates.add(str);
  candidates.add(upper);

  if (upper.startsWith('#')) {
    const withoutHash = upper.substring(1);
    candidates.add(withoutHash);
    if (/^\d+$/.test(withoutHash)) {
      candidates.add('TR' + withoutHash);
    }
  }

  if (upper.startsWith('TR')) {
    const withoutTR = upper.replace(/^TR[-_\s]*/, '');
    if (withoutTR && /^\d+$/.test(withoutTR)) {
      candidates.add(withoutTR);
      candidates.add('#' + withoutTR);
      candidates.add('TR' + withoutTR);
    }
  }

  if (/^\d+$/.test(str)) {
    candidates.add(str);
    candidates.add('#' + str);
    candidates.add('TR' + str);
  }

  const prefixMatch = upper.match(/^([A-Z]{2,4})[-_\s]*(\d+)$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const digits = prefixMatch[2];
    candidates.add(`${prefix}${digits}`);
    candidates.add(`${prefix}-${digits}`);
    candidates.add(`#${prefix}${digits}`);
    candidates.add(`#${prefix}-${digits}`);
  }

  return Array.from(candidates).filter(Boolean);
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
  const storeId = req.query.store_id;
  global.activeSyncs = global.activeSyncs || {};
  const status = global.activeSyncs[tenantId] || { shopify: false, courier: false };
  
  // Also return current syncProgress for the store (polling fallback when SSE is unavailable)
  let progress = null;
  if (storeId && global.syncProgress && global.syncProgress[storeId]) {
    const p = global.syncProgress[storeId];
    if (p && !p.abort) {
      progress = {
        status: p.status || null,
        processed: p.processed || 0,
        total: p.total || 0,
        currentOrder: p.currentOrder || null,
        sync_type: p.sync_type || null,
        storeId: storeId
      };
    }
  }
  
  res.json({ success: true, ...status, progress });
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
// GET /api/finance/overview?store_id=1 — Lightweight Store Financial Health KPIs
router.get('/overview', (req, res) => {
  const storeId = Number(req.query.store_id) || 1;
  try {
    const unpaid = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(price), 0) as total
      FROM orders
      WHERE store_id = ?
        AND LOWER(delivery_status) = 'delivered'
        AND (payment_status IS NULL OR LOWER(payment_status) != 'paid' OR COALESCE(paid_amount, 0) <= 0)
    `).get(storeId);

    const variance = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(price - COALESCE(paid_amount, 0)), 0) as net_diff
      FROM orders
      WHERE store_id = ?
        AND LOWER(delivery_status) = 'delivered'
        AND COALESCE(paid_amount, 0) > 0
        AND ABS(COALESCE(price, 0) - COALESCE(paid_amount, 0)) > ?
    `).get(storeId, PAYMENT_VARIANCE_TOLERANCE);

    const recent30d = db.prepare(`
      SELECT COUNT(*) as cnt,
             COALESCE(SUM(COALESCE(paid_amount, 0)), 0) as cod_total,
             COALESCE(SUM(COALESCE(courier_fee, 0)), 0) as fee_total
      FROM orders
      WHERE store_id = ?
        AND payment_date >= date('now', '-30 days')
        AND (COALESCE(paid_amount, 0) > 0 OR COALESCE(courier_fee, 0) > 0)
    `).get(storeId);

    const sessions = db.prepare(`
      SELECT COUNT(*) as cnt, MAX(created_at) as last_at
      FROM recon_sessions
      WHERE store_id = ?
    `).get(storeId);

    res.json({
      success: true,
      unpaid_delivered_count: unpaid?.cnt || 0,
      unpaid_delivered_value: Math.round((unpaid?.total || 0) * 100) / 100,
      variance_count: variance?.cnt || 0,
      variance_net_diff: Math.round((variance?.net_diff || 0) * 100) / 100,
      reconciled_30d_orders: recent30d?.cnt || 0,
      reconciled_30d_cod: Math.round((recent30d?.cod_total || 0) * 100) / 100,
      reconciled_30d_fees: Math.round((recent30d?.fee_total || 0) * 100) / 100,
      total_sessions: sessions?.cnt || 0,
      last_reconciled_at: sessions?.last_at || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/bulk-update — Supports dryRun preview, Rule 25 duplicate protection, Rule 22 variance check & tracking mismatch audit
router.post('/bulk-update', async (req, res) => {
  const { store_id, rows, masterKey, syncToShopify, session_id, dryRun = false, allowDuplicates = false } = req.body;
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
    let duplicateCount = 0;
    let varianceCount = 0;
    let errorCount = 0;
    let totalCod = 0;
    let totalCharges = 0;
    let totalNetPayout = 0;

    let sessionId = session_id || null;
    if (!dryRun && !sessionId) {
      const sessionResult = db.prepare(
        'INSERT INTO recon_sessions (store_id, filename, row_count, sync_to_shopify, processed_count, ghost_count, audit_count) VALUES (?, ?, ?, ?, 0, 0, 0)'
      ).run(store_id, req.body.filename || 'Manual Upload', req.body.total_rows || rows.length, syncToShopify ? 1 : 0);
      sessionId = sessionResult.lastInsertRowid;
    }

    const ordersToProcess = {};
    for (const row of rows) {
      const rawOrderVal = String(row.orderId || '').trim();
      const inputTrack = String(row.trackingNumber || '').toLowerCase().replace(/\s+/g, '');
      if (!rawOrderVal && !inputTrack) continue;

      let order = null;
      if (masterKey === "Match by Tracking Number") {
        if (inputTrack) {
          order = db.prepare("SELECT * FROM orders WHERE store_id = ? AND LOWER(REPLACE(tracking_number, ' ', '')) = ?").get(store_id, inputTrack);
        }
        if (!order && rawOrderVal) {
          const candidates = getOrderMatchingCandidates(rawOrderVal);
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
        const candidates = getOrderMatchingCandidates(rawOrderVal);
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
        results.push({
          ...row,
          codAmount: parseAmount(row.codAmount),
          charges: parseAmount(row.charges),
          status: '🛑 GHOST: Not in Database',
          recommendation: 'Order not found in ERP — click Fix Ghost Order or check Store selector',
          netPayout: 0,
        });
        ghostCount++;
        continue;
      }

      if (!ordersToProcess[order.id]) {
        ordersToProcess[order.id] = { order, rows: [] };
      }
      ordersToProcess[order.id].rows.push(row);
    }

    for (const orderIdKey in ordersToProcess) {
      const { order, rows: orderRows } = ordersToProcess[orderIdKey];
      const combinedNotes = [];

      for (const row of orderRows) {
        const type = String(row.type || '').toUpperCase().trim().charAt(0);
        const amount = parseAmount(row.codAmount);
        const charges = parseAmount(row.charges);
        const ref = String(row.ref || '').trim();
        const dateStr = formatDate(row.date);

        // Tracking mismatch audit check
        const inputTrackNorm = String(row.trackingNumber || '').toLowerCase().replace(/\s+/g, '');
        const dbTrackNorm = String(order.tracking_number || '').toLowerCase().replace(/\s+/g, '');
        const trackingMismatch = Boolean(inputTrackNorm && dbTrackNorm && inputTrackNorm !== dbTrackNorm);
        if (trackingMismatch) auditCount++;

        // Rule 25: Strict Duplicate Prevention Check (cpr_reference OR order_id + payment_date)
        if (!allowDuplicates) {
          let dupReason = null;
          if (ref) {
            const existingLog = db.prepare(
              'SELECT id, session_id FROM recon_logs WHERE order_id = ? AND cpr_reference = ? LIMIT 1'
            ).get(order.id, ref);
            if (existingLog || (order.payment_ref && String(order.payment_ref).trim() === ref)) {
              dupReason = `Already reconciled under Ref "${ref}"`;
            }
          } else if (dateStr && type === 'D' && order.payment_date === dateStr && (order.payment_status === 'Paid' || order.payment_status === 'Payment Posted')) {
            dupReason = `Already marked Paid on ${dateStr}`;
          }

          if (dupReason) {
            duplicateCount++;
            results.push({
              ...row,
              dbOrderId: order.id,
              orderRef: order.ref_number || order.shopify_order_id,
              dbTracking: order.tracking_number || '',
              trackingMismatch,
              codAmount: amount,
              charges,
              courierName: order.courier,
              orderPrice: order.price || 0,
              isDuplicate: true,
              status: '🔁 Duplicate (Skipped)',
              recommendation: `${dupReason} — skipped to prevent double entry`,
              netPayout: 0,
            });
            continue;
          }
        }

        const chargesTrick = order.courier_fee || 0;
        const taxAddOn = 0;
        const finalCharges = charges > 0 ? charges : chargesTrick;

        // 📊 Taxes Breakdown Engine (Freight + 15% GST + 4% WHT)
        const whtBreakdown = Math.round(amount * 0.04 * 100) / 100;
        const freightAndGst = charges > whtBreakdown ? charges - whtBreakdown : 0;
        const freightBreakdown = Math.round((freightAndGst / 1.15) * 100) / 100;
        const gstBreakdown = Math.round((freightAndGst - freightBreakdown) * 100) / 100;

        // Rule 22: COD Variance Check (ABS(price - paid_amount) > 0.9 PKR)
        const orderPrice = Number(order.price) || 0;
        const variance = type === 'D' ? Math.round((amount - orderPrice) * 100) / 100 : 0;
        const hasVariance = type === 'D' && orderPrice > 0 && Math.abs(variance) > PAYMENT_VARIANCE_TOLERANCE;
        if (hasVariance) varianceCount++;

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
          if (dryRun) {
            const netPayout = Math.round((amount - charges) * 100) / 100;
            totalCod += amount;
            totalCharges += charges;
            totalNetPayout += netPayout;
            processedCount++;
            results.push({
              ...row,
              dbOrderId: order.id,
              orderRef: order.ref_number || order.shopify_order_id,
              dbTracking: order.tracking_number || '',
              trackingMismatch,
              codAmount: amount,
              charges,
              orderPrice,
              variance,
              hasVariance,
              status: hasVariance ? '⚠️ Preview (Variance)' : '🔍 Preview Ready',
              recommendation: hasVariance
                ? `COD ${variance < 0 ? 'Shortfall' : 'Surplus'} Rs. ${Math.abs(variance).toLocaleString()} (Order Rs. ${orderPrice.toLocaleString()} vs Sheet Rs. ${amount.toLocaleString()})`
                : 'Ready to mark Delivered & Paid',
              netPayout,
              courierName: order.courier,
              balance: Math.max(0, orderPrice - (order.paid_amount || 0)),
              chargesTrick,
              taxAddOn,
              finalCharges,
              freightBreakdown,
              gstBreakdown,
              whtBreakdown,
            });
            continue;
          }

          try {
            let balance = 0;
            const alreadyPaidInERP = (order.payment_status === 'Paid' || order.payment_status === 'Payment Posted');

            if (syncToShopify) {
              const financials = await getShopifyFinancials(store, order.shopify_order_id);
              balance = Math.round((financials.total_price - financials.total_received) * 100) / 100;
            }

            const isWithinTolerance = syncToShopify && !alreadyPaidInERP && Math.abs(balance - amount) <= SHOPIFY_CAPTURE_TOLERANCE && amount > 0;
            const shouldCapture = syncToShopify && !alreadyPaidInERP && (amount <= balance || isWithinTolerance) && amount > 0;

            if (shouldCapture) {
              const captureAmount = isWithinTolerance ? balance : amount;
              await captureShopifyPayment(store, order.shopify_order_id, captureAmount);
            }

            if (syncToShopify) {
              try {
                const targetOrdId = order.shopify_order_id || order.ref_number || order.id;
                await markShopifyOrderDelivered(store, targetOrdId);
              } catch (mErr) {
                console.warn(`[finance-sessions] Mark as delivered failed for ${order.shopify_order_id || order.ref_number}:`, mErr.message);
              }

              // Rule 23 Standard Delivered Shopify Note Format
              const netAmt = Math.round((amount - charges) * 100) / 100;
              combinedNotes.push(` | 💰 COD Rec: ${dateStr} | Ref: ${ref} | Amt: ${amount} | Charges: ${charges} | Net: ${netAmt}`);
            }

            let finalCourierFee = charges;
            if (order.courier_fee > 0 && (order.courier === 'TCS' || order.courier === 'Leopards' || order.courier === 'LCS' || String(order.courier).toLowerCase().includes('insta'))) {
              finalCourierFee = order.courier_fee + charges;
            }

            db.prepare(`
              UPDATE orders 
              SET payment_status = 'Paid',
                  delivery_status = CASE WHEN LOWER(delivery_status) IN ('return received', 'cancelled') THEN delivery_status ELSE 'Delivered' END,
                  courier_fee = ?,
                  payment_ref = ?,
                  paid_amount = ?,
                  payment_date = ?,
                  cost_locked = 1 
              WHERE id = ?
            `).run(finalCourierFee, ref, amount, dateStr, order.id);

            const netPayout = Math.round((amount - charges) * 100) / 100;
            totalCod += amount;
            totalCharges += charges;
            totalNetPayout += netPayout;

            let rec = !syncToShopify ? '✅ ERP Recorded' : (shouldCapture ? '✅ Full Sync' : '✅ ERP Updated (Shopify Skipped)');
            if (hasVariance) {
              rec += ` · ${variance < 0 ? 'Shortfall' : 'Surplus'} Rs. ${Math.abs(variance).toLocaleString()}`;
            }

            results.push({
              ...row,
              dbOrderId: order.id,
              orderRef: order.ref_number || order.shopify_order_id,
              dbTracking: order.tracking_number || '',
              trackingMismatch,
              codAmount: amount,
              charges,
              orderPrice,
              variance,
              hasVariance,
              status: hasVariance ? '⚠️ Done (Variance)' : '✅ Done',
              recommendation: rec,
              netPayout,
              courierName: order.courier,
              balance,
              chargesTrick,
              taxAddOn,
              finalCharges,
              freightBreakdown,
              gstBreakdown,
              whtBreakdown,
            });
            processedCount++;

            db.prepare(`INSERT INTO recon_logs (session_id, order_id, old_delivery_status, old_payment_status, old_courier_fee, old_paid_amount, old_payment_ref, old_payment_date, cpr_reference) VALUES (?,?,?,?,?,?,?,?,?)`)
              .run(sessionId, order.id, logData.old_delivery_status, logData.old_payment_status, logData.old_courier_fee, logData.old_paid_amount, logData.old_payment_ref, logData.old_payment_date, ref || null);
          } catch (e) {
            errorCount++;
            results.push({ ...row, dbOrderId: order.id, orderRef: order.ref_number || order.shopify_order_id, codAmount: amount, charges, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
          }
        } else if (type === 'R') {
          if (dryRun) {
            const netPayout = Math.round((-charges) * 100) / 100;
            totalCharges += charges;
            totalNetPayout += netPayout;
            processedCount++;
            results.push({
              ...row,
              dbOrderId: order.id,
              orderRef: order.ref_number || order.shopify_order_id,
              dbTracking: order.tracking_number || '',
              trackingMismatch,
              codAmount: amount,
              charges,
              orderPrice,
              status: '🔍 Preview Ready',
              recommendation: 'Ready to record Return Fee',
              netPayout,
              courierName: order.courier,
              chargesTrick,
              taxAddOn,
              finalCharges,
            });
            continue;
          }

          try {
            const isAlreadyDelivered = ['delivered', 'return received'].includes((order.delivery_status || '').toLowerCase());
            if (syncToShopify && !isAlreadyDelivered) {
              // Rule 23 Standard Return Shopify Note Format
              combinedNotes.push(` | ↩️ Return Charged: ${dateStr} | Ref: ${ref} | Charges: ${charges}`);
            }

            let finalCourierFee = charges;
            if (order.courier_fee > 0 && (order.courier === 'TCS' || order.courier === 'Leopards' || order.courier === 'LCS' || String(order.courier).toLowerCase().includes('insta'))) {
              finalCourierFee = order.courier_fee + charges;
            }

            db.prepare(`
              UPDATE orders 
              SET delivery_status = CASE WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN delivery_status ELSE 'Returned' END,
                  courier_fee = ?,
                  payment_status = CASE WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN payment_status ELSE 'Returned' END,
                  paid_amount = CASE WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN paid_amount ELSE 0 END,
                  payment_ref = CASE WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN payment_ref ELSE COALESCE(NULLIF(?, ''), payment_ref) END,
                  payment_date = CASE WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN payment_date ELSE COALESCE(NULLIF(?, ''), payment_date) END
              WHERE id = ?
            `).run(finalCourierFee, ref, dateStr, order.id);

            const netPayout = Math.round((-charges) * 100) / 100;
            totalCharges += charges;
            totalNetPayout += netPayout;

            results.push({
              ...row,
              dbOrderId: order.id,
              orderRef: order.ref_number || order.shopify_order_id,
              dbTracking: order.tracking_number || '',
              trackingMismatch,
              codAmount: amount,
              charges,
              orderPrice,
              status: '✅ Done',
              recommendation: isAlreadyDelivered ? 'Return Fee Recorded (Kept Delivered Status)' : 'Return Fee & Ref Recorded',
              netPayout,
              courierName: order.courier,
              chargesTrick,
              taxAddOn,
              finalCharges,
            });
            processedCount++;

            db.prepare(`INSERT INTO recon_logs (session_id, order_id, old_delivery_status, old_payment_status, old_courier_fee, old_paid_amount, old_payment_ref, old_payment_date, cpr_reference) VALUES (?,?,?,?,?,?,?,?,?)`)
              .run(sessionId, order.id, logData.old_delivery_status, logData.old_payment_status, logData.old_courier_fee, logData.old_paid_amount, logData.old_payment_ref, logData.old_payment_date, ref || null);
          } catch (e) {
            errorCount++;
            results.push({ ...row, dbOrderId: order.id, orderRef: order.ref_number || order.shopify_order_id, codAmount: amount, charges, status: '❌ API Error', recommendation: e.message, netPayout: 0 });
          }
        } else {
          errorCount++;
          results.push({ ...row, dbOrderId: order.id, orderRef: order.ref_number || order.shopify_order_id, codAmount: amount, charges, status: '⚠️ Invalid Type', recommendation: "Use 'D' (Delivered) or 'R' (Returned)", netPayout: 0 });
        }
      }

      if (!dryRun && syncToShopify && combinedNotes.length > 0) {
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

    // Update running session totals across chunks
    if (!dryRun && sessionId) {
      db.prepare(`
        UPDATE recon_sessions
        SET processed_count = COALESCE(processed_count, 0) + ?,
            ghost_count = COALESCE(ghost_count, 0) + ?,
            audit_count = COALESCE(audit_count, 0) + ?
        WHERE id = ?
      `).run(processedCount, ghostCount, auditCount, sessionId);
    }

    res.json({
      success: true,
      dryRun: !!dryRun,
      sessionId,
      results,
      summary: {
        processedCount,
        ghostCount,
        auditCount,
        duplicateCount,
        varianceCount,
        errorCount,
        totalCod: Math.round(totalCod * 100) / 100,
        totalCharges: Math.round(totalCharges * 100) / 100,
        totalNetPayout: Math.round(totalNetPayout * 100) / 100,
      }
    });
  } catch (err) {
    console.error('Finance Bulk Update Error:', err);
    res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
});

// GET /api/finance/reconciliation-history?store_id=1 (enriched with financial totals per session)
router.get('/reconciliation-history', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  try {
    const history = db.prepare(`
      SELECT rs.*,
        (SELECT GROUP_CONCAT(DISTINCT cpr_reference)
         FROM recon_logs
         WHERE session_id = rs.id AND cpr_reference IS NOT NULL AND cpr_reference != '') as cpr_references,
        (SELECT COUNT(*) FROM recon_logs WHERE session_id = rs.id) as log_count,
        (SELECT COALESCE(SUM(COALESCE(o.paid_amount, 0)), 0)
         FROM recon_logs rl JOIN orders o ON o.id = rl.order_id
         WHERE rl.session_id = rs.id) as total_cod,
        (SELECT COALESCE(SUM(COALESCE(o.courier_fee, 0)), 0)
         FROM recon_logs rl JOIN orders o ON o.id = rl.order_id
         WHERE rl.session_id = rs.id) as total_fees
      FROM recon_sessions rs
      WHERE rs.store_id = ?
      ORDER BY rs.created_at DESC
      LIMIT 60
    `).all(Number(store_id));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/reconciliation-session/:sessionId — Full Order Drilldown for Upload History
router.get('/reconciliation-session/:sessionId', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM recon_sessions WHERE id = ?').get(Number(req.params.sessionId));
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const items = db.prepare(`
      SELECT rl.id as log_id, rl.order_id, rl.cpr_reference, rl.shopify_note_added,
             rl.old_delivery_status, rl.old_payment_status, rl.old_paid_amount, rl.old_courier_fee,
             o.ref_number, o.shopify_order_id, o.tracking_number, o.customer_name, o.courier,
             o.price, o.paid_amount, o.courier_fee, o.delivery_status, o.payment_status,
             o.payment_ref, o.payment_date
      FROM recon_logs rl
      LEFT JOIN orders o ON o.id = rl.order_id
      WHERE rl.session_id = ?
      ORDER BY rl.id DESC
    `).all(Number(req.params.sessionId));

    let totalCod = 0, totalFees = 0, deliveredCount = 0, returnedCount = 0;
    for (const it of items) {
      const paid = Number(it.paid_amount) || 0;
      const fee = Number(it.courier_fee) || 0;
      totalCod += paid;
      totalFees += fee;
      if ((it.delivery_status || '').toLowerCase() === 'delivered') deliveredCount++;
      else if ((it.delivery_status || '').toLowerCase().includes('return')) returnedCount++;
    }

    res.json({
      success: true,
      session,
      items,
      totals: {
        count: items.length,
        deliveredCount,
        returnedCount,
        totalCod: Math.round(totalCod * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        netPayout: Math.round((totalCod - totalFees) * 100) / 100,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/resync-session-notes — Re-append missing Rule 23 Shopify notes for a past session
router.post('/resync-session-notes', async (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ success: false, error: 'session_id required' });
  try {
    const session = db.prepare('SELECT * FROM recon_sessions WHERE id = ?').get(Number(session_id));
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(session.store_id);
    if (!store || !store.access_token || store.access_token === 'PENDING') {
      return res.status(400).json({ success: false, error: 'Store missing valid Shopify token' });
    }

    const logs = db.prepare(`
      SELECT rl.id as log_id, rl.order_id, rl.cpr_reference, rl.shopify_note_added,
             o.shopify_order_id, o.delivery_status, o.paid_amount, o.courier_fee, o.payment_ref, o.payment_date
      FROM recon_logs rl
      JOIN orders o ON o.id = rl.order_id
      WHERE rl.session_id = ?
    `).all(Number(session_id));

    let synced = 0, skipped = 0, failed = 0;
    for (const row of logs) {
      if (row.shopify_note_added || !row.shopify_order_id) { skipped++; continue; }
      const isRet = (row.delivery_status || '').toLowerCase().includes('return');
      const amt = Number(row.paid_amount) || 0;
      const fee = Number(row.courier_fee) || 0;
      const ref = row.cpr_reference || row.payment_ref || '';
      const dt = row.payment_date || new Date().toISOString().split('T')[0];
      const noteLine = isRet
        ? ` | ↩️ Return Charged: ${dt} | Ref: ${ref} | Charges: ${fee}`
        : ` | 💰 COD Rec: ${dt} | Ref: ${ref} | Amt: ${amt} | Charges: ${fee} | Net: ${Math.round((amt - fee) * 100) / 100}`;
      try {
        const added = await appendShopifyNote(store, row.shopify_order_id, noteLine);
        if (added) {
          db.prepare('UPDATE recon_logs SET shopify_note_added = ? WHERE id = ?').run(added, row.log_id);
          synced++;
        } else skipped++;
      } catch (_) {
        failed++;
      }
    }

    res.json({ success: true, synced, skipped, failed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
  const { store_id, tracking_number, order_id_ref, amount, courier_fee, date, type, ref } = req.body;
  if (!store_id || (!tracking_number && !order_id_ref)) {
    return res.status(400).json({ error: 'store_id and tracking_number (or order_id_ref) required' });
  }

  try {
    const cleanTrack = String(tracking_number || '').trim();
    const cleanRef = String(order_id_ref || '').trim();
    if (cleanTrack) {
      const existing = db.prepare('SELECT id FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, cleanTrack);
      if (existing) return res.json({ success: true, message: 'Already exists', order_id: existing.id });
    }

    const isReturn = String(type || 'D').toUpperCase().startsWith('R');
    const cleanAmount = parseAmount(amount);
    const cleanFee = parseAmount(courier_fee);
    const cleanDate = formatDate(date) || new Date().toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO orders (
        store_id, shopify_order_id, ref_number, customer_name, order_date,
        price, tracking_number, delivery_status, payment_status,
        courier_fee, paid_amount, payment_ref, payment_date, order_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id,
      cleanRef || ('GHOST-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
      cleanRef || 'GHOST',
      'GHOST CUSTOMER',
      cleanDate,
      cleanAmount,
      cleanTrack,
      isReturn ? 'Returned' : 'Delivered',
      isReturn ? 'Returned' : 'Paid',
      cleanFee,
      isReturn ? 0 : cleanAmount,
      String(ref || '').trim() || null,
      cleanDate,
      'Manual / Ghost'
    );

    res.json({ success: true, order_id: result.lastInsertRowid });
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

              const rawCod = parseFloat(row.codAmount || row.invoicePayment || row.orderAmount || 0);
              return {
                'Order ID': String(ref).trim(),
                'Tracking Number': String(track).trim(),
                'Status': status,
                'Amount Collected': status === 'D' ? cod : 0,
                'COD Amount': rawCod,
                'Reserve Amount': parseFloat(row.reservePayment || row.reserveAmount || rawCod || 0),
                'price': rawCod,
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
        const ordPrice = parseFloat(ord.price) || 3500;
        const cod = status === 'D' ? ordPrice : 0;
        const baseShip = parseFloat(ord.courier_fee) || 250;
        const gst = baseShip * 0.19;
        const incomeTax = ordPrice * 0.02;
        const salesTax = ordPrice * 0.02;
        const totalExpense = baseShip + gst + incomeTax + salesTax;

        return {
          'Order ID': ord.ref_number || ord.shopify_order_id || 'TR' + Math.floor(Math.random()*10000),
          'Tracking Number': ord.tracking_number || 'PEX' + Math.floor(Math.random()*10000000),
          'Status': status,
          'Amount Collected': cod,
          'COD Amount': ordPrice,
          'Reserve Amount': ordPrice,
          'price': ordPrice,
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
      SET payment_status = 'Paid', 
          delivery_status = CASE WHEN LOWER(delivery_status) IN ('return received', 'cancelled') THEN delivery_status ELSE 'Delivered' END, 
          payment_ref = ?, 
          paid_amount = ?, 
          courier_fee = ?, 
          payment_date = ?, 
          cost_locked = 1 
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
    try {
      const { autoPostCprToLedger } = require('../../services/poLedgerService');
      const bankAmt = parseFloat(actualBankDeposit) > 0 ? parseFloat(actualBankDeposit) : (parseFloat(netPayout) || 0);
      autoPostCprToLedger(Number(store_id), { courier, cpr, amount: bankAmt, settlementDate }, req.user?.username || req.user?.email || 'Admin');
    } catch (_) {}
    res.json({ success: true, message: `CPR ${cpr} successfully locked and cleared!` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/finance/track-lookup?store_id=1&tracking_number=20120050024566
router.get('/track-lookup', async (req, res) => {
  const { store_id, tracking_number } = req.query;
  if (!store_id || !tracking_number) return res.status(400).json({ error: 'store_id and tracking_number required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const cleanTrack = String(tracking_number).trim();

    // 1. Search local DB orders first
    const dbOrder = db.prepare(`
      SELECT o.*, s.store_name 
      FROM orders o 
      LEFT JOIN stores s ON o.store_id = s.id 
      WHERE o.store_id = ? AND (o.tracking_number = ? OR o.ref_number = ? OR LOWER(o.tracking_number) = LOWER(?))
      LIMIT 1
    `).get(Number(store_id), cleanTrack, cleanTrack, cleanTrack);

    let courierName = dbOrder?.courier || 'PostEx';
    if (!dbOrder) {
      if (cleanTrack.toLowerCase().startsWith('iw') || cleanTrack.length === 10) {
        courierName = 'Instaworld';
      } else {
        courierName = 'PostEx';
      }
    }

    let liveData = null;

    // 2. Fetch from Live API if available
    if (courierName.toLowerCase().includes('postex') && store.postex_token && !store.postex_token.includes('****')) {
      try {
        const fetch = require('node-fetch');
        const apiUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/' + encodeURIComponent(cleanTrack);
        const response = await fetch(apiUrl, {
          headers: { 'token': store.postex_token },
          timeout: 8000
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.dist) liveData = data.dist;
        }
      } catch (e) {
        console.warn('[track-lookup PostEx live fetch notice]', e.message);
      }
    } else if (courierName.toLowerCase().includes('insta') && (store.instaworld_key || store.instaworld_key_backup)) {
      try {
        const { instaworldFetch } = require('../../engines/instaworld_http');
        const keys = [store.instaworld_key, store.instaworld_key_backup, store.instaworld_key_3].filter(Boolean);
        let trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        if (store.instaworld_track_url && !store.instaworld_track_url.includes('app.instaworld.pk') && !store.instaworld_track_url.includes('one.instaworld.pk/track')) {
          trackUrl = store.instaworld_track_url;
        }
        for (const k of keys) {
          try {
            const fetchRes = await instaworldFetch(trackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apiKey': k },
              body: JSON.stringify({ trackingNumber: cleanTrack }),
              timeout: 6000
            });
            if (fetchRes.ok) {
              const resJson = await fetchRes.json();
              if (resJson?.data || resJson?.shipment) {
                liveData = resJson.data || resJson.shipment;
                break;
              }
            }
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[track-lookup Instaworld live fetch notice]', e.message);
      }
    }

    // Extract settlement date
    const settlementDateRaw = liveData?.reservePaymentDate || liveData?.upfrontPaymentDate || dbOrder?.status_date || null;
    let settlementDate = null;
    if (settlementDateRaw) {
      const d = new Date(settlementDateRaw);
      if (!isNaN(d.getTime())) {
        settlementDate = d.toISOString().split('T')[0];
      }
    }

    // Fallback & Merge fields
    const invoicePayment = liveData?.invoicePayment || dbOrder?.price || 0;
    const reservePayment = liveData?.reservePayment || dbOrder?.paid_amount || invoicePayment;
    const transactionFee = liveData?.transactionFee || dbOrder?.courier_fee || 200;
    const transactionTax = liveData?.transactionTax || (courierName.toLowerCase().includes('insta') ? Math.round(invoicePayment * 0.04) : 0);

    const result = {
      trackingNumber: liveData?.trackingNumber || dbOrder?.tracking_number || cleanTrack,
      orderRef: liveData?.orderRefNumber || dbOrder?.ref_number || '—',
      courier: courierName,
      status: liveData?.transactionStatus || liveData?.status || dbOrder?.delivery_status || 'Pending',
      customerName: liveData?.customerName || dbOrder?.customer_name || '—',
      cityName: liveData?.cityName || dbOrder?.city || '—',
      invoicePayment,
      reservePayment,
      transactionFee,
      transactionTax,
      orderDeliveryDate: liveData?.orderDeliveryDate || dbOrder?.status_date || dbOrder?.order_date || null,
      settlementDate,
      reservePaymentDate: settlementDateRaw,
    };

    // 3. Cross-check ledger: find if this order/tracking matches a locked CPR or log
    let matchedCpr = null;

    if (dbOrder?.id) {
      const reconLog = db.prepare(`
        SELECT cpr_reference, old_payment_date as settlement_date, old_paid_amount as net_payout 
        FROM recon_logs 
        WHERE order_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(dbOrder.id);

      if (reconLog && reconLog.cpr_reference) {
        matchedCpr = {
          cpr_reference: reconLog.cpr_reference,
          courier: courierName,
          settlement_date: reconLog.settlement_date ? reconLog.settlement_date.split(' ')[0] : null,
          net_payout: reservePayment,
          actual_bank_deposit: reservePayment,
          audit_status: 'LOCKED / RECONCILED'
        };
      }
    }

    if (!matchedCpr && cleanTrack) {
      const cprOrder = db.prepare(`
        SELECT cpr_reference, settlement_date, amount_collected as net_payout 
        FROM cpr_settlement_orders 
        WHERE tracking_number = ? OR order_ref = ?
        ORDER BY id DESC LIMIT 1
      `).get(cleanTrack, dbOrder?.ref_number || cleanTrack);

      if (cprOrder && cprOrder.cpr_reference) {
        matchedCpr = {
          cpr_reference: cprOrder.cpr_reference,
          courier: courierName,
          settlement_date: cprOrder.settlement_date,
          net_payout: cprOrder.net_payout || reservePayment,
          actual_bank_deposit: cprOrder.net_payout || reservePayment,
          audit_status: 'LOCKED / RECONCILED'
        };
      }
    }

    if (!matchedCpr && settlementDate) {
      const ledgerRows = db.prepare(`
        SELECT cpr_reference, courier, settlement_date, net_payout, actual_bank_deposit, audit_status 
        FROM cpr_settlements 
        WHERE store_id = ? AND settlement_date = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(Number(store_id), settlementDate);
      if (ledgerRows) matchedCpr = ledgerRows;
    }

    res.json({ success: true, order: result, matchedCpr });
  } catch (err) {
    console.error('[track-lookup error]', err.message);
    res.status(500).json({ error: err.message });
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

// POST /api/finance/sync-shopify-notes — Sync Shopify notes to ERP DB for a list of tracking numbers
router.post('/sync-shopify-notes', async (req, res) => {
  const { store_id, tracking_numbers, order_ids } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
  if (!store || !store.access_token || store.access_token === 'PENDING') {
    return res.status(400).json({ error: 'Store not found or missing access token' });
  }

  const { shop_domain, access_token } = store;

  let targetOrders = [];
  if (Array.isArray(tracking_numbers) && tracking_numbers.length > 0) {
    const placeholders = tracking_numbers.map(() => '?').join(',');
    targetOrders = db.prepare(`SELECT id, shopify_order_id, tracking_number, notes FROM orders WHERE store_id = ? AND tracking_number IN (${placeholders})`).all(Number(store_id), ...tracking_numbers);
  } else if (Array.isArray(order_ids) && order_ids.length > 0) {
    const placeholders = order_ids.map(() => '?').join(',');
    targetOrders = db.prepare(`SELECT id, shopify_order_id, tracking_number, notes FROM orders WHERE store_id = ? AND id IN (${placeholders})`).all(Number(store_id), ...order_ids);
  } else {
    targetOrders = db.prepare(`SELECT id, shopify_order_id, tracking_number, notes FROM orders WHERE store_id = ? AND (payment_ref IS NOT NULL AND payment_ref != '') ORDER BY id DESC LIMIT 200`).all(Number(store_id));
  }

  let updatedCount = 0;
  const results = [];

  for (const ord of targetOrders) {
    if (!ord.shopify_order_id) continue;
    try {
      const resp = await fetch(`https://${shop_domain}/admin/api/2024-10/orders/${ord.shopify_order_id}.json?fields=id,note`, {
        headers: { 'X-Shopify-Access-Token': access_token }
      });
      if (resp.ok) {
        const sData = await resp.json();
        const shopifyNote = sData.order?.note || '';
        if (shopifyNote !== ord.notes) {
          db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(shopifyNote, ord.id);
          updatedCount++;
          results.push({ tracking: ord.tracking_number, oldNote: ord.notes, newNote: shopifyNote, status: '✅ Updated' });
        } else {
          results.push({ tracking: ord.tracking_number, note: shopifyNote, status: 'ℹ️ Already in sync' });
        }
      }
    } catch (err) {
      results.push({ tracking: ord.tracking_number, error: err.message, status: '❌ Failed' });
    }
  }

  res.json({ success: true, updatedCount, total: targetOrders.length, results });
});

module.exports = router;
