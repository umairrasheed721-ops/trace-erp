const cron = require('node-cron');
const db = require('./db');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./engines/shopify');
const { syncPostEx, syncInstaworld } = require('./engines/tracking');
const { runWatchdog } = require('./engines/watchdog');

function getAllStores() {
  return db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
}

module.exports = function schedulerInit() {
  console.log('⏰ Scheduler initialized');

  // Every 1 hour: Fetch new Shopify orders for all stores
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 [CRON] Hourly Shopify fetch starting...');
    for (const store of getAllStores()) {
      try { await fetchShopifyOrders(store); } catch (e) { console.error(e.message); }
    }
  });

  // Every 2 hours: Refresh recent Shopify order updates
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔄 [CRON] Shopify refresh starting...');
    for (const store of getAllStores()) {
      try { await refreshShopifyUpdates(store); } catch (e) { console.error(e.message); }
    }
  });

  // Every hour (offset by 30 min): Smart PostEx sync
  cron.schedule('30 * * * *', async () => {
    console.log('🚚 [CRON] PostEx SMART sync starting...');
    for (const store of getAllStores()) {
      try { await syncPostEx(store, 'SMART'); } catch (e) { console.error(e.message); }
    }
  });

  // Every 6 hours: Full PostEx sync
  cron.schedule('0 */6 * * *', async () => {
    console.log('🚚 [CRON] PostEx FULL sync starting...');
    for (const store of getAllStores()) {
      try { await syncPostEx(store, 'FULL'); } catch (e) { console.error(e.message); }
    }
  });

  // Every hour (offset by 45 min): Instaworld sync
  cron.schedule('45 * * * *', async () => {
    console.log('🚚 [CRON] Instaworld sync starting...');
    for (const store of getAllStores()) {
      try { await syncInstaworld(store, 'SMART'); } catch (e) { console.error(e.message); }
    }
  });

  // Every 6 hours (offset): Watchdog run (PostEx only - per user confirmation)
  cron.schedule('0 2,8,14,20 * * *', async () => {
    console.log('🐕 [CRON] Watchdog audit starting...');
    for (const store of getAllStores()) {
      try { await runWatchdog(store); } catch (e) { console.error(e.message); }
    }
  });
};
