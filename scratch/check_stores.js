const DatabaseSync = require('node:sqlite').DatabaseSync;
const fs = require('fs');
const path = require('path');

const pathsToCheck = [
  '/Users/umairrasheed/Desktop/antigravity/trace-erp',
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend'
];

for (const dir of pathsToCheck) {
  const dbFiles = fs.readdirSync(dir).filter(f => f.endsWith('.db') || f.endsWith('.sqlite'));
  for (const dbFile of dbFiles) {
    const dbPath = path.join(dir, dbFile);
    try {
      const conn = new DatabaseSync(dbPath);
      let stores = [];
      try {
        stores = conn.prepare("SELECT id, shop_domain, store_name FROM stores").all();
      } catch (e) {
        conn.close();
        continue;
      }
      if (stores.length > 0) {
        console.log(`\nDatabase: ${dbPath}`);
        console.log("Stores:", JSON.stringify(stores, null, 2));
      }
      conn.close();
    } catch (e) {
      // Ignore open errors
    }
  }
}
