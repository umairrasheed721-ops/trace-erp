const db = require('../db');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Ensure log directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, 'reconciliation.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFilePath, logMsg);
  } catch (err) {
    console.error('Failed to write to reconciliation.log', err);
  }
}

/**
 * Perform Shopify dual write-back by checking for existing fulfillments.
 * If one exists, we update tracking. If not, we create one.
 */
async function writeTrackingToShopify(store, shopifyOrderId, trackingNumber) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') {
    throw new Error('No valid Shopify access token');
  }

  // Step 1: Fetch fulfillments for the order
  const fListUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillments.json`;
  const fListRes = await fetch(fListUrl, {
    headers: { 'X-Shopify-Access-Token': access_token },
    timeout: 10000 // 10 second timeout
  });
  
  if (!fListRes.ok) {
    throw new Error(`Failed to fetch fulfillments: HTTP ${fListRes.status}`);
  }
  
  const fListData = await fListRes.json();
  const activeFulfillment = (fListData.fulfillments || []).find(f => f.status !== 'cancelled');

  if (activeFulfillment) {
    // Step 2a: Update tracking info on the active fulfillment
    const updateUrl = `https://${shop_domain}/admin/api/2024-10/fulfillments/${activeFulfillment.id}/update_tracking.json`;
    const payload = {
      fulfillment: {
        tracking_info: {
          number: trackingNumber,
          company: 'PostEx',
          url: `https://postex.pk/tracking?tracking_number=${trackingNumber}`
        },
        notify_customer: true
      }
    };
    
    const updateRes = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      body: JSON.stringify(payload)
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json().catch(() => ({}));
      throw new Error(`Shopify update_tracking failed: ${JSON.stringify(errData.errors || errData)}`);
    }
  } else {
    // Step 2b: Create a new fulfillment
    const foUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillment_orders.json`;
    const foRes = await fetch(foUrl, {
      headers: { 'X-Shopify-Access-Token': access_token },
      timeout: 10000
    });
    
    if (!foRes.ok) {
      throw new Error(`Failed to fetch fulfillment orders: HTTP ${foRes.status}`);
    }
    
    const foData = await foRes.json();
    if (!foData.fulfillment_orders || !foData.fulfillment_orders.length) {
      throw new Error('No fulfillable orders found in Shopify');
    }

    const openFO = foData.fulfillment_orders.find(fo => fo.status === 'open') || foData.fulfillment_orders[0];
    const fulfillmentOrderId = openFO.id;

    const createUrl = `https://${shop_domain}/admin/api/2024-10/fulfillments.json`;
    const payload = {
      fulfillment: {
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: fulfillmentOrderId,
            fulfillment_order_line_items: openFO.line_items.map(li => ({ id: li.id, quantity: li.quantity }))
          }
        ],
        tracking_info: {
          number: trackingNumber,
          company: 'PostEx',
          url: `https://postex.pk/tracking?tracking_number=${trackingNumber}`
        },
        notify_customer: true
      }
    };

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      body: JSON.stringify(payload)
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      throw new Error(`Shopify create fulfillment failed: ${JSON.stringify(errData.errors || errData)}`);
    }
  }
}

/**
 * Main reconciliation runner
 */
async function runReconciliation() {
  log('==================================================');
  log('Starting Tracking ID Reconciliation Engine...');
  log('==================================================');

  // Load active stores
  const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
  log(`Found ${stores.length} active store(s) to process.`);

  let totalProcessed = 0;
  let totalResolved = 0;
  let totalFailed = 0;

  for (const store of stores) {
    log(`Processing store: ${store.shop_domain} (ID: ${store.id})`);
    
    if (!store.postex_token) {
      log(`[WARNING] Store ${store.shop_domain} has no PostEx token. Skipping tracking lookup.`);
      continue;
    }

    // Fetch booked orders lacking tracking numbers
    const orders = db.prepare(`
      SELECT * FROM orders 
      WHERE store_id = ?
        AND LOWER(delivery_status) = 'booked' 
        AND (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
    `).all(store.id);

    console.log(`[RECONCILE AUDIT] Found ${orders.length} pending orders for store ID ${store.id} before processing.`);
    log(`Found ${orders.length} orders pending tracking reconciliation.`);

    for (const order of orders) {
      totalProcessed++;
      const orderRef = order.ref_number ? order.ref_number.trim() : null;

      if (!orderRef) {
        log(`[ERROR] Order ID ${order.id} is missing a reference number (ref_number). Skipping.`);
        db.prepare(`
          INSERT INTO tracking_reconciliation_logs (order_id, order_ref, status, error_message, last_attempted_at)
          VALUES (?, ?, ?, ?, datetime('now', '+5 hours'))
          ON CONFLICT(order_id) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            last_attempted_at = excluded.last_attempted_at
        `).run(order.id, 'UNKNOWN', 'failed', 'Missing order reference (ref_number)');
        totalFailed++;
        continue;
      }

      log(`[Order: ${orderRef}] Pinging PostEx for missing tracking number...`);
      let trackingNumber = null;
      let errorMsg = null;

      try {
        const url = `https://api.postex.pk/services/integration/api/order/v1/get-order-detail-by-ref-number?orderRefNumber=${encodeURIComponent(orderRef)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'token': store.postex_token,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // Strict 10-second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        
        if (data.statusCode === '200') {
          trackingNumber = data.dist?.trackingNumber || data.dist?.tracking_number || data.dist?.trackingNo || data.trackingNumber || data.tracking_number;
          if (!trackingNumber && data.dist && typeof data.dist === 'string') {
            trackingNumber = data.dist;
          }
          
          if (!trackingNumber) {
            errorMsg = 'PostEx API returned 200, but no trackingNumber field was found in response';
          }
        } else {
          errorMsg = data.statusMessage || `PostEx error code: ${data.statusCode}`;
        }
      } catch (err) {
        errorMsg = `PostEx API Request Failed: ${err.message}`;
      }

      if (trackingNumber) {
        log(`[Order: ${orderRef}] Success! Retrieved Tracking ID: ${trackingNumber}`);

        // Update database orders table
        db.prepare(`
          UPDATE orders 
          SET tracking_number = ?, courier = 'PostEx', status_date = datetime('now')
          WHERE id = ?
        `).run(trackingNumber, order.id);

        // Update reconciliation logs
        db.prepare(`
          INSERT INTO tracking_reconciliation_logs (order_id, order_ref, status, error_message, last_attempted_at, resolved_at)
          VALUES (?, ?, ?, NULL, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
          ON CONFLICT(order_id) DO UPDATE SET
            status = excluded.status,
            error_message = NULL,
            last_attempted_at = excluded.last_attempted_at,
            resolved_at = excluded.resolved_at
        `).run(order.id, orderRef, 'resolved');

        // Shopify Write-Back
        try {
          log(`[Order: ${orderRef}] Dual writing tracking ${trackingNumber} to Shopify...`);
          await writeTrackingToShopify(store, order.shopify_order_id, trackingNumber);
          log(`[Order: ${orderRef}] Shopify write-back successful.`);
          totalResolved++;
        } catch (shopifyErr) {
          log(`[Order: ${orderRef}] [WARNING] Shopify write-back failed: ${shopifyErr.message}`);
          db.prepare(`
            UPDATE tracking_reconciliation_logs 
            SET error_message = ?
            WHERE order_id = ?
          `).run(`Shopify sync failed: ${shopifyErr.message}`, order.id);
          // Count as resolved since we successfully got the tracking number and updated local DB, 
          // but we capture the shopify error for manual review.
          totalResolved++;
        }
      } else {
        log(`[Order: ${orderRef}] [FAILED] Reconcile failed: ${errorMsg}`);
        
        db.prepare(`
          INSERT INTO tracking_reconciliation_logs (order_id, order_ref, status, error_message, last_attempted_at)
          VALUES (?, ?, ?, ?, datetime('now', '+5 hours'))
          ON CONFLICT(order_id) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            last_attempted_at = excluded.last_attempted_at
        `).run(order.id, orderRef, 'failed', errorMsg);
        totalFailed++;
      }
    }
  }

  log(`==================================================`);
  log(`Reconciliation Complete. Summary:`);
  log(`Total Processed: ${totalProcessed}`);
  log(`Successfully Resolved: ${totalResolved}`);
  log(`Failed to Reconcile: ${totalFailed}`);
  log(`==================================================`);

  return {
    totalProcessed,
    totalResolved,
    totalFailed
  };
}

if (require.main === module) {
  runReconciliation()
    .then(() => {
      log('Reconciliation CLI run finished.');
      process.exit(0);
    })
    .catch(err => {
      log(`FATAL Error in Reconciliation CLI: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { runReconciliation, writeTrackingToShopify };
