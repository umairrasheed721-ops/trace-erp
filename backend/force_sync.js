const db = require('./db');
const { fetchShopifyOrders } = require('./engines/shopify');

async function forceSync() {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  if (!store) return console.log('No store found');

  console.log(`🚀 Starting Force Deep Sync for ${store.shop_domain}...`);
  
  // Set last_synced_at to far past to ensure we scan everything
  db.prepare("UPDATE stores SET last_synced_at = '2020-01-01' WHERE id = ?").run(store.id);

  try {
    const result = await fetchShopifyOrders(store, (status, progress) => {
      console.log(`[${status}] ${progress}`);
    }, { forceDeepSync: true });
    
    console.log('✅ Force Sync Complete:', result);
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync Failed:', err);
    process.exit(1);
  }
}

forceSync();
