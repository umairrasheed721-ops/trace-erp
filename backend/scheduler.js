const cron = require('node-cron');
const db = require('./db');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./engines/shopify');
const { syncPostEx, syncInstaworld } = require('./engines/tracking');
const { runWatchdog } = require('./engines/watchdog');
const { getShopifyInventoryCosts } = require('./engines/shopify_finance');
const { runSniperScan } = require('./engines/sniper');

function getAllStores() {
  return db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
}

async function syncStoreInventoryAndCosts(store) {
  console.log(`📦 [CRON] Background Inventory & Cost Sync starting for Store ${store.id}...`);
  try {
    const products = await getShopifyInventoryCosts(store);
    db.transaction(() => {
      for (const p of products) {
        let existing = null;
        const variantId = p.shopify_variant_id ? String(p.shopify_variant_id) : '';
        const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
        const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
        const sku = p.sku ? String(p.sku).trim() : '';

        const queryVariantId1 = numericVariantId || '__NONE__';
        const queryVariantId2 = gidVariantId || '__NONE__';
        const querySku = sku || '__NONE__';

        existing = db.prepare(`
          SELECT id FROM product_master_costs 
          WHERE store_id = ? 
          AND (
            shopify_variant_id = ? 
            OR shopify_variant_id = ? 
            OR (sku = ? AND sku != '')
          )
          ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 ELSE 1 END) ASC, 
                   (CASE WHEN sku = ? THEN 0 ELSE 1 END) ASC
          LIMIT 1
        `).get(Number(store.id), queryVariantId1, queryVariantId2, querySku, queryVariantId1, queryVariantId2, querySku);

        if (existing) {
          db.prepare(`
            UPDATE product_master_costs SET
              shopify_variant_id = ?, sku = ?, parent_title = ?, variant_title = ?, shopify_cost = ?, selling_price = ?, inventory_qty = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, existing.id);
        } else {
          db.prepare(`
            INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
              shopify_variant_id = excluded.shopify_variant_id,
              sku = COALESCE(excluded.sku, product_master_costs.sku),
              shopify_cost = excluded.shopify_cost,
              selling_price = excluded.selling_price,
              inventory_qty = excluded.inventory_qty,
              updated_at = datetime('now')
          `).run(Number(store.id), p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty);
        }
      }
    })();
    console.log(`✅ [CRON] Successfully synced ${products.length} catalog items for Store ${store.id}.`);
  } catch (e) {
    console.error(`❌ [CRON] Inventory sync failed for Store ${store.id}:`, e.message);
  }
}

async function runDynamicScheduler() {
    try {
        const schedules = db.prepare('SELECT * FROM sync_schedules WHERE is_active = 1').all();
        const now = new Date();
        
        for (const s of schedules) {
            const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
            
            if (!nextRun || nextRun <= now) {
                console.log(`🚚 [DYNAMIC] Triggering ${s.courier} (${s.sync_type}) sync...`);
                
                // Calculate and save next run time FIRST to prevent overlap if check runs again
                const intervalMs = (s.interval_minutes || 60) * 60000;
                const newNextRun = new Date(now.getTime() + intervalMs);
                
                db.prepare('UPDATE sync_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
                  .run(now.toISOString(), newNextRun.toISOString(), s.id);

                const stores = getAllStores();
                for (const store of stores) {
                    try {
                        if (s.courier === 'PostEx') {
                            await syncPostEx(store, s.sync_type);
                        } else {
                            await syncInstaworld(store, s.sync_type);
                        }
                    } catch (e) {
                        console.error(`Error in dynamic sync for ${s.courier}:`, e.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Dynamic Scheduler Error:', err.message);
    }
}

module.exports = function schedulerInit() {
  console.log('⏰ Scheduler initialized (Dynamic Mode)');

  // 1. Every 1 minute: Check for due dynamic syncs
  cron.schedule('* * * * *', runDynamicScheduler);

  // 2. Every 1 hour: Fetch new Shopify orders
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 [CRON] Hourly Shopify fetch starting...');
    for (const store of getAllStores()) {
      try { await fetchShopifyOrders(store); } catch (e) { console.error(e.message); }
    }
  });

  // 3. Every 2 hours: Refresh recent Shopify updates
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔄 [CRON] Shopify refresh starting...');
    for (const store of getAllStores()) {
      try { await refreshShopifyUpdates(store); } catch (e) { console.error(e.message); }
    }
  });

  // 4. Every 6 hours (offset): Watchdog audit
  cron.schedule('0 2,8,14,20 * * *', async () => {
    console.log('🐕 [CRON] Watchdog audit starting...');
    for (const store of getAllStores()) {
      try { await runWatchdog(store); } catch (e) { console.error(e.message); }
    }
  });

  // 5. Every 4 hours: Automated background inventory & cost sync
  cron.schedule('0 */4 * * *', async () => {
    console.log('📦 [CRON] Automated 4-hour inventory & cost sync starting...');
    for (const store of getAllStores()) {
      try { await syncStoreInventoryAndCosts(store); } catch (e) { console.error(e.message); }
    }
  });

  // 6. Every 2 hours: Stuck Parcel Sniper — auto-alert customers with stuck parcels
  cron.schedule('0 */2 * * *', async () => {
    console.log('🎯 [CRON] Stuck Parcel Sniper scan starting...');
    try { await runSniperScan(); } catch (e) { console.error('Sniper cron error:', e.message); }
  });

  // Fire sniper once on boot (after 60s delay to let bot connect)
  setTimeout(async () => {
    try { await runSniperScan(); } catch(e) {}
  }, 60000);
};
