const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const backendDir = path.resolve(__dirname, '../backend');
const files = fs.readdirSync(backendDir);

const dbFiles = files.filter(f => f.startsWith('trace_erp') && f.endsWith('.db'));
console.log('Database files found:', dbFiles);

for (const dbFile of dbFiles) {
  const dbPath = path.join(backendDir, dbFile);
  console.log(`\n--- Inspecting ${dbFile} ---`);
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
    console.error(`Error reading ${dbFile}:`, err.message);
  } finally {
    db.close();
  }
}
