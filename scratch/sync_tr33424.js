const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));
const { syncSingleShopifyOrder } = require(path.resolve(__dirname, '../backend/engines/shopify/orders'));

async function run() {
  try {
    // Find order in DB
    const order = db.prepare(`SELECT * FROM orders WHERE ref_number LIKE '%33424%' OR customer_name LIKE '%Salman Khan%' OR phone LIKE '%3259100093%'`).get();
    console.log('Found Order in DB:', order);

    if (order) {
      const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(order.store_id);
      console.log('Syncing single order from Shopify:', order.shopify_order_id, 'for store:', store.shop_domain);
      
      const success = await syncSingleShopifyOrder(store, order.shopify_order_id);
      console.log('Sync success:', success);

      const updated = db.prepare(`SELECT id, ref_number, shopify_order_id, tags, notes, delivery_status FROM orders WHERE id = ?`).get(order.id);
      console.log('Updated Order in DB after sync:', JSON.stringify(updated, null, 2));
    } else {
      console.log('Order not found by query, searching all stores...');
      const stores = db.prepare(`SELECT * FROM stores`).all();
      console.log('Stores:', stores.map(s => ({ id: s.id, shop: s.shop_domain })));
    }
  } catch (err) {
    console.error('Sync Error:', err);
  }
}

run();
