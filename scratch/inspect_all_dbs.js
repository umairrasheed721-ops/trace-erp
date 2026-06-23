const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');
const files = fs.readdirSync(backendDir);

console.log('--- DB INSPECTOR ---');
for (const file of files) {
  if (file.endsWith('.db')) {
    const fullPath = path.join(backendDir, file);
    const stats = fs.statSync(fullPath);
    if (stats.size === 0) continue;
    
    try {
      const db = new DatabaseSync(fullPath);
      // Check if orders table exists
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
      if (tableCheck) {
        const count = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        console.log(`File: ${file} | Size: ${stats.size} bytes | Orders count: ${count}`);
      } else {
        console.log(`File: ${file} | Size: ${stats.size} bytes | No 'orders' table`);
      }
    } catch (err) {
      console.log(`File: ${file} | Size: ${stats.size} bytes | Error: ${err.message}`);
    }
  }
}
