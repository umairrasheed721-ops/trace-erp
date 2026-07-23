const db = require('../db');
const { broadcast } = require('../sse');

/**
 * Immediately marks a Shopify order as cancelled in the SQLite database and broadcasts the change.
 * This is used for real-time Shopify webhook invalidation.
 * 
 * @param {number} storeId - The store's primary key ID.
 * @param {number|string} shopifyOrderId - The Shopify order ID.
 */
function markOrderAsCancelled(storeId, shopifyOrderId) {
  try {
    console.log(`[SyncService] Invalidation: Marking Shopify Order ID ${shopifyOrderId} as Cancelled`);
    
    // Find if order exists in DB
    const order = db.prepare('SELECT id, delivery_status FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(storeId, String(shopifyOrderId));
    if (!order) {
      console.log(`[SyncService] Invalidation: Order ${shopifyOrderId} not found in database, skipping local update.`);
      return false;
    }

    // Update status to Cancelled and update status_date
    const result = db.prepare(`
      UPDATE orders 
      SET delivery_status = 'Cancelled',
          status_date = datetime('now')
      WHERE id = ?
    `).run(order.id);

    if (result.changes > 0) {
      console.log(`[SyncService] Invalidation Success: Mapped order ${shopifyOrderId} to Cancelled`);
      // Broadcast to frontend to instantly update lists/UI
      try {
        broadcast('order_updated', { storeId, shopifyOrderId: String(shopifyOrderId) });
      } catch (e) {
        console.error('[SyncService] Broadcast error:', e.message);
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error('[SyncService] markOrderAsCancelled error:', err.message);
    return false;
  }
}

/**
 * Pings Shopify API to get the latest status for a single order and updates the DB.
 * Runs independently of the bulk sync process.
 * 
 * @param {number} orderId - The ERP order primary key ID.
 */
async function resyncSingleOrder(orderId) {
  try {
    const order = db.prepare('SELECT id, store_id, shopify_order_id FROM orders WHERE id = ? OR ref_number = ?').get(orderId, String(orderId));
    if (!order || !order.shopify_order_id) {
      throw new Error('Order not found in database or missing Shopify order reference.');
    }

    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
    if (!store) {
      throw new Error('Store configuration not found.');
    }

    console.log(`[SyncService] Force Resync triggered for Order ID ${order.id} (Shopify ID: ${order.shopify_order_id})`);
    
    // Resolve dynamically to prevent circular dependencies
    const { syncSingleShopifyOrder } = require('../engines/shopify');
    const success = await syncSingleShopifyOrder(store, order.shopify_order_id);
    if (success) {
      console.log(`[SyncService] Force Resync Success: Synced Shopify Order ID ${order.shopify_order_id}`);
      return { success: true };
    } else {
      throw new Error('Sync engine failed to update order.');
    }
  } catch (err) {
    console.error('[SyncService] resyncSingleOrder error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  markOrderAsCancelled,
  resyncSingleOrder
};
