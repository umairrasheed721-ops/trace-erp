const db = require('./db');
const { syncOrderByNumber } = require('./engines/shopify');

async function run() {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  if (!store) return console.log('No store found');

  console.log(`🚀 Syncing Order TR31584 for ${store.shop_domain}...`);
  try {
    const result = await syncOrderByNumber(store, 'TR31584');
    console.log('✅ Sync Result:', JSON.stringify(result, null, 2));
    
    // Check if it got a cost
    const order = db.prepare('SELECT ref_number, product_titles, cost FROM orders WHERE ref_number = "TR31584"').get();
    console.log('📊 Order in DB:', order);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync Failed:', err);
    process.exit(1);
  }
}
run();
