const { db, DB_DIR } = require('../db');
const { markOrderAsCancelled } = require('../services/SyncService');
const tenantContext = require('../tenant-context');
const fs = require('fs');

function getAllTenants() {
  const tenants = ['default'];
  try {
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants in Shopify Webhook:', e.message);
  }
  return tenants;
}

/**
 * processProductUpdateForCosts — called when Shopify fires products/update webhook
 * Updates product_master_costs with new price, image, and logs cost drift
 */
function processProductUpdateForCosts(storeId, payload) {
  try {
    const variants = payload.variants || [];
    const parentTitle = payload.title;
    if (!parentTitle || variants.length === 0) return;

    for (const v of variants) {
      const variantTitle = v.title === 'Default Title' ? '' : (v.title || '');
      const newSku = v.sku ? String(v.sku).trim() : '';
      const newPrice = parseFloat(v.price || 0);
      const newQty = parseInt(v.inventory_quantity || 0, 10);
      const newImageId = v.image_id;
      const gid = `gid://shopify/ProductVariant/${v.id}`;

      // Find image URL from payload.images
      let imageUrl = null;
      if (newImageId && payload.images) {
        const img = payload.images.find(i => i.id === newImageId);
        if (img) imageUrl = img.src;
      }
      // Fallback: first product image
      if (!imageUrl && payload.image?.src) imageUrl = payload.image.src;

      const status = payload.status ? String(payload.status).toLowerCase() : 'active';

      // Find existing row
      const existing = db.prepare(`
        SELECT id, unit_cost, shopify_cost, selling_price
        FROM product_master_costs
        WHERE store_id = ? AND (
          shopify_variant_id = ? OR shopify_variant_id = ? OR
          (parent_title = ? AND variant_title = ?)
        ) LIMIT 1
      `).get(Number(storeId), String(v.id), gid, parentTitle, variantTitle);

      if (existing) {
        // Update SKU, title, selling_price, image, status, policy, qty — but preserve unit_cost
        db.prepare(`
          UPDATE product_master_costs SET
            shopify_variant_id = COALESCE(shopify_variant_id, ?),
            sku = ?,
            parent_title = ?,
            variant_title = ?,
            selling_price = ?,
            inventory_qty = ?,
            variant_image_url = COALESCE(?, variant_image_url),
            status = ?,
            inventory_policy = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(gid, newSku, parentTitle, variantTitle, newPrice, newQty, imageUrl || null, status, v.inventory_policy || 'deny', existing.id);

        console.log(`🔔 [Webhook] Updated SKU '${newSku}'/price/image/status for "${parentTitle} - ${variantTitle}" → Rs ${newPrice}`);
      } else {
        // Insert new variant into cost registry
        db.prepare(`
          INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty, variant_image_url, inventory_policy, status)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `).run(Number(storeId), gid, newSku, parentTitle, variantTitle, newPrice, newQty, imageUrl || null, v.inventory_policy || 'deny', status);

        console.log(`✨ [Webhook] Inserted new variant into cost registry: "${parentTitle} - ${variantTitle}" (SKU: '${newSku}')`);
      }
    }
  } catch (e) {
    console.error('[Webhook] processProductUpdateForCosts error:', e.message);
  }
}

module.exports = async function handleShopifyWebhook(req, res) {
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  const payload = req.body;

  if (!shopDomain || !payload || !payload.id) {
    return res.status(400).send('Invalid webhook data');
  }

  // Webhook Verification & Logging Requirement
  console.log(`📬 [Shopify Webhook] Received webhook. Topic: ${topic}, Shop: ${shopDomain}, Payload ID: ${payload.id}, Cancelled At: ${payload.cancelled_at || 'N/A'}`);

  try {
    // Scan all tenants to locate the store
    const tenants = getAllTenants();
    let matchedTenantId = null;
    let store = null;

    for (const tenantId of tenants) {
      tenantContext.run(tenantId, () => {
        try {
          const found = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shopDomain);
          if (found) {
            store = found;
            matchedTenantId = tenantId;
          }
        } catch (e) {
          // Ignore queries failing on uninitialized databases
        }
      });
      if (store) break;
    }

    if (!store) {
      console.log(`[Shopify Webhook] Store not found for shop domain: ${shopDomain}`);
      return res.status(404).send('Store not found');
    }

    // Process inside the matched tenant context
    await tenantContext.run(matchedTenantId, async () => {
      if (topic && topic.startsWith('products/')) {
        if (topic === 'products/delete') {
          db.prepare('DELETE FROM products WHERE store_id = ? AND shopify_product_id = ?').run(store.id, String(payload.id));
          console.log(`🗑️ [Shopify Webhook] Deleted product ${payload.id} from local cache.`);
        } else if (topic === 'products/update' || topic === 'products/create') {
          // 1. Sync product to local product catalog cache
          const { syncShopifyProduct } = require('../engines/shopify');
          syncShopifyProduct(db, store.id, store.shop_domain, payload);
          console.log(`🔄 [Shopify Webhook] Synced product ${payload.id} to local cache.`);

          // 2. Update costing registry with new price/image (real-time R1)
          processProductUpdateForCosts(store.id, payload);
        }
      } else if (topic === 'orders/cancelled' || (payload.cancelled_at !== undefined && payload.cancelled_at !== null)) {
        // Immediate cancellation state invalidation
        const targetOrderId = payload.order_id || payload.id;
        console.log(`🛑 [Shopify Webhook] Immediate cancellation detected for Shopify Order ID: ${targetOrderId}`);
        markOrderAsCancelled(store.id, targetOrderId);
      } else {
        // Normal single order sync for other updates (e.g. orders/updated, orders/fulfilled, fulfillments/create)
        const targetOrderId = payload.order_id || payload.id;
        console.log(`📦 [Shopify Webhook] Syncing single order ID: ${targetOrderId} (Topic: ${topic})`);
        const { syncSingleShopifyOrder } = require('../engines/shopify');
        const success = await syncSingleShopifyOrder(store, targetOrderId);
        if (!success) {
          throw new Error(`Single order sync failed for order ${targetOrderId}`);
        }
      }
    });

    res.status(200).send('OK');

  } catch (err) {
    console.error('[ShopifyWebhook Error]:', err.stack || err.message);
    res.status(500).send('Internal Server Error');
  }
};
