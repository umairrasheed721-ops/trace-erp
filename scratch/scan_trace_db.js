const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../backend/db/trace.db');
console.log(`Inspecting database: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log('File does not exist!');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

try {
  const registryCount = db.prepare("SELECT count(*) as count FROM product_master_costs").get().count;
  const ordersCount = db.prepare("SELECT count(*) as count FROM orders").get().count;
  console.log(`product_master_costs entries: ${registryCount}`);
  console.log(`orders entries: ${ordersCount}`);

  if (registryCount > 0) {
    const pcosts = db.prepare("SELECT parent_title, variant_title, shopify_variant_id FROM product_master_costs WHERE lower(parent_title) LIKE '%perry%' OR lower(parent_title) LIKE '%sky%'").all();
    console.log('Registry matches:', pcosts);
  }
  
  if (ordersCount > 0) {
    const oMatch = db.prepare("SELECT id, shopify_order_id, line_items, product_titles FROM orders WHERE lower(line_items) LIKE '%perry%' OR lower(line_items) LIKE '%sky%'").all();
    console.log('Orders matches count:', oMatch.length);
    if (oMatch.length > 0) {
      console.log('Sample match line_items:', oMatch[0].line_items);
    }
  }
} catch (err) {
  console.error(`Error reading database:`, err.message);
} finally {
  db.close();
}
