const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const parentDir = path.join(__dirname, '..');
const files = fs.readdirSync(parentDir);
for (const file of files) {
  if (file.endsWith('.db') || file.endsWith('.sqlite')) {
    const dbPath = path.join(parentDir, file);
    try {
      const db = new DatabaseSync(dbPath);
      const ordersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
      if (ordersTable) {
        const count = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
        console.log(`Database ${file} has ${count} orders.`);
        if (count > 0) {
          const latest = db.prepare("SELECT id, ref_number, customer_name, order_date, phone FROM orders ORDER BY id DESC LIMIT 3").all();
          console.log(`Latest 3 in ${file}:`, JSON.stringify(latest, null, 2));
        }
      }
      const storesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stores'").get();
      if (storesTable) {
        const stores = db.prepare("SELECT id, shop_domain, store_name FROM stores").all();
        console.log(`Stores in ${file}:`, JSON.stringify(stores, null, 2));
      }
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }
}
