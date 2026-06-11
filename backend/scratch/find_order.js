const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname);
for (const file of files) {
  if (file.endsWith('.db') || file.endsWith('.sqlite')) {
    const dbPath = path.join(__dirname, file);
    try {
      const db = new DatabaseSync(dbPath);
      // Check if orders table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
      if (tableExists) {
        const order = db.prepare("SELECT * FROM orders WHERE ref_number LIKE '%TR32463%' OR ref_number LIKE '%TR32462%'").all();
        if (order.length > 0) {
          console.log(`Found in ${file}:`, JSON.stringify(order, null, 2));
        }
      }
    } catch (e) {
      // ignore
    }
  }
}
