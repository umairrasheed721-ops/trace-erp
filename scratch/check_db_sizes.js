const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backendDir = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend';
const files = fs.readdirSync(backendDir);

for (const file of files) {
  if (file.endsWith('.db')) {
    const fullPath = path.join(backendDir, file);
    try {
      const db = new DatabaseSync(fullPath);
      const ordersCount = db.prepare(`SELECT count(*) as count FROM orders`).get().count;
      console.log(`- File: ${file}`);
      console.log(`  Size: ${fs.statSync(fullPath).size} bytes`);
      console.log(`  Orders: ${ordersCount} rows`);
      
      // Let's also print stores if possible
      try {
        const stores = db.prepare(`SELECT id, shop_domain, name FROM stores`).all();
        console.log(`  Stores:`, stores);
      } catch (e) {
        console.log(`  Stores: Error (${e.message})`);
      }
    } catch (e) {
      console.log(`- File: ${file} (Error: ${e.message})`);
    }
  }
}
