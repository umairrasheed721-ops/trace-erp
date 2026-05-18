const cron = require('node-cron');
const db = require('./db');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./engines/shopify');
const { syncPostEx, syncInstaworld } = require('./engines/tracking');
const { runWatchdog } = require('./engines/watchdog');
const { getShopifyInventoryCosts } = require('./engines/shopify_finance');

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
        if (p.shopify_variant_id) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND shopify_variant_id = ?').get(Number(store.id), p.shopify_variant_id);
        }
        if (!existing) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?').get(Number(store.id), p.parent_name, p.variant_name);
        }

        if (existing) {
          db.prepare(`
            UPDATE product_master_costs SET
              shopify_variant_id = ?, sku = ?, parent_title = ?, variant_title = ?, shopify_cost = ?, selling_price = ?, inventory_qty = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, existing.id);
        } else {
          db.prepare(`
            INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
};
