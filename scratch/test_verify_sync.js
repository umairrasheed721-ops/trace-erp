const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = '/app/data/trace_erp.db'; // Production DB path on Railway
console.log('DB Path:', DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  console.error('Database file not found at:', DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

// Helper function to run the sync
async function testSync() {
  const order = db.prepare("SELECT id, store_id, shopify_order_id, ref_number FROM orders WHERE ref_number = 'TR32349'").get();
  if (!order) {
    console.error("Order TR32349 not found in DB!");
    return;
  }
  console.log("Found order in DB:", order);

  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(order.store_id);
  if (!store) {
    console.error("Store not found for order!");
    return;
  }

  // Resolve syncSingleShopifyOrder
  const { syncSingleShopifyOrder } = require('../backend/engines/shopify');
  console.log("Running syncSingleShopifyOrder for TR32349...");
  const success = await syncSingleShopifyOrder(store, order.shopify_order_id);
  console.log("Sync result:", success);

  const updatedOrder = db.prepare("SELECT ref_number, product_titles, items_count, line_items, price, delivery_status FROM orders WHERE id = ?").get(order.id);
  console.log("Updated order fields in DB:");
  console.log(JSON.stringify(updatedOrder, null, 2));
}

testSync().catch(err => {
  console.error("Error running test sync:", err);
});
