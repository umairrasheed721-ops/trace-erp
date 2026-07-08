const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
console.log(`🔌 Connecting to database at: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error("❌ Database file not found!");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

// 1. Get List of Tables and Row Counts
console.log("\n📊 Tables List and Row Counts:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => {
  try {
    const countRes = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    console.log(` - ${t.name}: ${countRes.cnt} rows`);
  } catch (err) {
    console.log(` - ${t.name}: Error: ${err.message}`);
  }
});
