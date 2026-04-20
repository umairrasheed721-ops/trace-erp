const { syncInstaworld } = require('./engines/tracking');
const db = require('./db');

async function test() {
  const store = db.prepare("SELECT * FROM stores LIMIT 1").get();
  console.log("Store:", store);

  // insert dummy order
  db.prepare("INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, delivery_status) VALUES (?, ?, ?, ?, ?)").run(store.id, "TEST-IW-123", "IW123456789", "Instaworld", "Pending");

  await syncInstaworld(store);

  const orderAfter = db.prepare("SELECT * FROM orders WHERE shopify_order_id = 'TEST-IW-123'").get();
  console.log("After Sync:", orderAfter.delivery_status);

  db.prepare("DELETE FROM orders WHERE shopify_order_id = 'TEST-IW-123'").run();
}
test();
