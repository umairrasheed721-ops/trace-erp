const db = require('../db');
const { getShopifyInventoryCosts, getShopifySingleProductCosts } = require('../engines/shopify_finance');
const { broadcast } = require('../sse');

/**
 * costSyncService.js
 * 
 * Central engine for Hybrid Shopify Cost Auto-Sync:
 * 1. Event-Driven Micro-Sync (Webhooks: real-time targeted single product update)
 * 2. Background Periodic Reconciler (Scheduled cron: full catalog sweep)
 * 3. On-Demand 1-Click Sync (UI button)
 */

/**
 * Returns Set of product_cost_id values that have unpushed ERP stock changes
 * (PO_RECEIVE / PO_RECOUNT_SET / PO_EDIT / MANUAL_ADJUST / PO_REVERSE with shopify_pushed=0
 * newer than the last successful Shopify push).
 * Protects "ERP = Inventory Boss" local counts from being overwritten by Shopify background sync.
 */
function getUnpushedErpSkuIds(storeId) {
  const protectedIds = new Set();
  try {
    const rows = db.prepare(`
      SELECT DISTINCT il.product_cost_id
      FROM inventory_ledger il
      WHERE il.store_id = ?
        AND il.product_cost_id IS NOT NULL
        AND il.shopify_pushed = 0
        AND il.movement_type IN ('PO_RECEIVE', 'PO_RECOUNT_SET', 'PO_EDIT', 'MANUAL_ADJUST', 'PO_REVERSE')
        AND il.id > COALESCE((
          SELECT MAX(il2.id)
          FROM inventory_ledger il2
          WHERE il2.store_id = il.store_id
            AND il2.product_cost_id = il.product_cost_id
            AND il2.shopify_pushed = 1
        ), 0)
    `).all(Number(storeId) || 1);
    for (const r of rows) {
      if (r.product_cost_id) protectedIds.add(Number(r.product_cost_id));
    }
  } catch (_) {
    // Safe fallback if inventory_ledger does not exist yet
  }
  return protectedIds;
}

/**
 * Upsert a list of variant cost objects into product_master_costs
 */
function upsertVariantCosts(storeId, variants, options = {}) {
  if (!Array.isArray(variants) || variants.length === 0) return 0;

  const protectedIds = options.forceOverwriteStock ? new Set() : getUnpushedErpSkuIds(storeId);

  const selectStmt = db.prepare(`
    SELECT id, unit_cost, shopify_cost, selling_price, inventory_qty, on_hand_qty, committed_qty
    FROM product_master_costs 
    WHERE store_id = ? 
    AND (
      shopify_variant_id = ? 
      OR shopify_variant_id = ? 
      OR (sku = ? AND sku != '')
      OR (parent_title = ? AND variant_title = ?)
    )
    ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 
                   WHEN sku = ? AND sku != '' THEN 1
                   ELSE 2 END) ASC
    LIMIT 1
  `);

  const updateStmt = db.prepare(`
    UPDATE product_master_costs SET
      shopify_variant_id = COALESCE(?, shopify_variant_id),
      sku = CASE WHEN ? != '' THEN ? ELSE sku END,
      parent_title = ?,
      variant_title = ?,
      shopify_cost = ?,
      selling_price = ?,
      inventory_qty = ?,
      committed_qty = ?,
      on_hand_qty = ?,
      incoming_qty = ?,
      variant_image_url = COALESCE(?, variant_image_url),
      status = ?,
      inventory_policy = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const insertStmt = db.prepare(`
    INSERT INTO product_master_costs (
      store_id, shopify_variant_id, sku, parent_title, variant_title, 
      unit_cost, packaging_cost, landed_cost,
      shopify_cost, selling_price, inventory_qty, committed_qty, on_hand_qty, incoming_qty,
      variant_image_url, inventory_policy, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
      shopify_variant_id = excluded.shopify_variant_id,
      sku = CASE WHEN excluded.sku != '' THEN excluded.sku ELSE product_master_costs.sku END,
      shopify_cost = excluded.shopify_cost,
      selling_price = excluded.selling_price,
      inventory_qty = excluded.inventory_qty,
      committed_qty = excluded.committed_qty,
      on_hand_qty = excluded.on_hand_qty,
      incoming_qty = excluded.incoming_qty,
      variant_image_url = COALESCE(excluded.variant_image_url, product_master_costs.variant_image_url),
      status = excluded.status,
      inventory_policy = excluded.inventory_policy,
      updated_at = datetime('now')
  `);

  let modifiedCount = 0;
  let protectedCount = 0;
  db.transaction(() => {
    for (const v of variants) {
      const variantId = v.shopify_variant_id ? String(v.shopify_variant_id) : '';
      const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
      const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
      const sku = v.sku ? String(v.sku).trim() : '';
      const pName = v.parent_name || v.parent_title || '';
      const vName = v.variant_name || v.variant_title || '';
      const cost = parseFloat(v.shopify_cost || 0);
      const price = parseFloat(v.selling_price || 0);
      const qty = parseInt(v.qty || v.inventory_qty || 0, 10);
      const committedQty = parseInt(v.committed_qty || 0, 10) || 0;
      const onHandQty = v.on_hand_qty !== undefined && v.on_hand_qty !== null ? parseInt(v.on_hand_qty, 10) : (qty + committedQty);
      const incomingQty = parseInt(v.incoming_qty || 0, 10) || 0;
      const img = v.image_url || v.variant_image_url || null;
      const status = v.status || 'active';
      const policy = v.inventory_policy || 'deny';

      const qVar1 = numericVariantId || '__NONE__';
      const qVar2 = gidVariantId || '__NONE__';
      const qSku = sku || '__NONE__';

      const existing = selectStmt.get(Number(storeId), qVar1, qVar2, qSku, pName, vName, qVar1, qVar2, qSku);

      if (existing) {
        let finalQty = qty;
        let finalOnHand = onHandQty;
        if (protectedIds.has(Number(existing.id))) {
          // ERP Boss Shield: keep unpushed local On-Hand intact, only refresh live Committed from Shopify!
          const erpOnHand = existing.on_hand_qty !== null && existing.on_hand_qty !== undefined
            ? parseInt(existing.on_hand_qty, 10)
            : ((parseInt(existing.inventory_qty, 10) || 0) + (parseInt(existing.committed_qty, 10) || 0));
          finalOnHand = erpOnHand;
          finalQty = erpOnHand - committedQty;
          protectedCount++;
        }
        updateStmt.run(gidVariantId || variantId, sku, sku, pName, vName, cost, price, finalQty, committedQty, finalOnHand, incomingQty, img, status, policy, existing.id);
      } else {
        insertStmt.run(Number(storeId), gidVariantId || variantId, sku, pName, vName, cost, price, qty, committedQty, onHandQty, incomingQty, img, policy, status);
      }
      modifiedCount++;
    }
  })();

  if (protectedCount > 0) {
    console.log(`🛡️ [ERP Boss Shield] Protected ${protectedCount} unpushed SKU(s) on Store #${storeId} from Shopify stock overwrite.`);
  }
  return modifiedCount;
}

/**
 * Record sync timestamp in stores table
 */
function recordCostSyncTimestamp(storeId) {
  try {
    db.prepare("UPDATE stores SET last_cost_sync_at = datetime('now') WHERE id = ?").run(Number(storeId));
  } catch (e) {
    console.warn(`[costSyncService] Failed to record last_cost_sync_at for store ${storeId}:`, e.message);
  }
}

/**
 * Layer 1: Real-Time Event-Driven Micro-Sync (Webhooks)
 * Triggered on products/update & products/create
 */
async function syncSingleProductCosts(storeId, productId) {
  if (!storeId || !productId) return { success: false, message: 'storeId and productId required' };

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(storeId));
    if (!store || !store.access_token) return { success: false, message: 'Store not found or token missing' };

    const variants = await getShopifySingleProductCosts(store, productId);
    if (!variants || variants.length === 0) {
      return { success: false, message: 'No variants returned from Shopify GraphQL' };
    }

    const count = upsertVariantCosts(storeId, variants);
    recordCostSyncTimestamp(storeId);

    // Notify connected frontend clients in real time
    try {
      broadcast('cost_drift_updated', { storeId: Number(storeId), productId: String(productId) });
    } catch (_) {}

    console.log(`⚡ [Hybrid Micro-Sync] Auto-synced costs for product ${productId} (${count} variants) on Store #${storeId}`);
    return { success: true, count };
  } catch (err) {
    console.error(`❌ [costSyncService] syncSingleProductCosts failed for ${productId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Layer 2 & Layer 3: Full Catalog Sync
 * Used by 6-Hour Background Cron and Manual 1-Click Button
 */
async function syncFullCatalog(storeId) {
  if (!storeId) return { success: false, error: 'store_id required' };

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(storeId));
    if (!store) return { success: false, error: 'Store not found' };
    if (!store.access_token) return { success: false, error: 'Store has no Shopify access token configured' };

    let totalSynced = 0;
    await getShopifyInventoryCosts(store, async (products) => {
      const count = upsertVariantCosts(storeId, products);
      totalSynced += count;
    });

    recordCostSyncTimestamp(storeId);

    // Broadcast update to all clients
    try {
      broadcast('cost_drift_updated', { storeId: Number(storeId), fullSync: true });
    } catch (_) {}

    console.log(`✅ [Hybrid Full-Sync] Completed catalog sync for Store #${storeId}: ${totalSynced} variants processed.`);
    return { success: true, count: totalSynced };
  } catch (err) {
    console.error(`❌ [costSyncService] syncFullCatalog failed for Store #${storeId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get sync status and last synced timestamp
 */
function getLastSyncStatus(storeId) {
  const targetStoreId = Number(storeId) || 1;
  try {
    const store = db.prepare('SELECT id, store_name, shop_domain, last_cost_sync_at FROM stores WHERE id = ?').get(targetStoreId);
    const driftRow = db.prepare(`
      SELECT COUNT(*) AS drift_count 
      FROM product_master_costs 
      WHERE store_id = ? 
        AND unit_cost > 0 
        AND shopify_cost > 0 
        AND ABS(shopify_cost - unit_cost) >= 1
    `).get(targetStoreId);

    return {
      success: true,
      store_id: targetStoreId,
      store_name: store?.store_name || store?.shop_domain || `Store #${targetStoreId}`,
      last_cost_sync_at: store?.last_cost_sync_at || null,
      drift_count: driftRow?.drift_count || 0
    };
  } catch (err) {
    return {
      success: false,
      store_id: targetStoreId,
      last_cost_sync_at: null,
      drift_count: 0,
      error: err.message
    };
  }
}

module.exports = {
  getUnpushedErpSkuIds,
  upsertVariantCosts,
  syncSingleProductCosts,
  syncFullCatalog,
  getLastSyncStatus,
  recordCostSyncTimestamp
};
