const { syncPostEx } = require('./engines/tracking');
const db = require('./db');

async function test() {
  const store = db.prepare("SELECT * FROM stores LIMIT 1").get();
  console.log("Store:", store);

  // insert dummy order
  db.prepare("INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, delivery_status) VALUES (?, ?, ?, ?, ?)").run(store.id, "TEST-123", "20120050021771", "PostEx", "Pending");

  const orderBefore = db.prepare("SELECT * FROM orders WHERE shopify_order_id = 'TEST-123'").get();
  console.log("Before Sync:", orderBefore.delivery_status);

  await syncPostEx(store);

  const orderAfter = db.prepare("SELECT * FROM orders WHERE shopify_order_id = 'TEST-123'").get();
  console.log("After Sync:", orderAfter.delivery_status);

  db.prepare("DELETE FROM orders WHERE shopify_order_id = 'TEST-123'").run();
}
test();
