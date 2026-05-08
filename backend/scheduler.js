const cron = require('node-cron');
const db = require('./db');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./engines/shopify');
const { syncPostEx, syncInstaworld } = require('./engines/tracking');
const { runWatchdog } = require('./engines/watchdog');

function getAllStores() {
  return db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
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
};
