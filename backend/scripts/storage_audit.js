const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('🔍 --- PRODUCTION STORAGE AUDIT --- 🔍');

// 1. Filesystem audit
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, '..', 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);
const DB_DIR = path.dirname(DB_PATH);

console.log(`📂 Auditing directory: ${DB_DIR}`);

if (fs.existsSync(DB_DIR)) {
  try {
    const files = fs.readdirSync(DB_DIR);
    const fileDetails = files.map(file => {
      const filePath = path.join(DB_DIR, file);
      const stat = fs.statSync(filePath);
      return {
        name: file,
        sizeMB: (stat.size / (1024 * 1024)).toFixed(3),
        sizeBytes: stat.size
      };
    });

    // Sort files by size descending
    fileDetails.sort((a, b) => b.sizeBytes - a.sizeBytes);

    console.log('\n📁 Files by Size in Database Directory:');
    fileDetails.forEach(f => {
      console.log(`  - ${f.name}: ${f.sizeMB} MB`);
    });
  } catch (err) {
    console.error('❌ Failed to read directory files:', err.message);
  }
} else {
  console.log('⚠️ Database directory does not exist yet.');
}

// 2. Database internal table audit
if (fs.existsSync(DB_PATH)) {
  console.log(`\n🔌 Auditing Database File: ${DB_PATH}`);
  try {
    const db = new DatabaseSync(DB_PATH);
    
    // Get all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`📊 Found ${tables.length} tables. Auditing row counts...`);

    const tableCounts = [];
    tables.forEach(t => {
      const tableName = t.name;
      try {
        const countRes = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
        tableCounts.push({
          name: tableName,
          rows: countRes.count
        });
      } catch (e) {
        // Table might be locked or corrupt
        tableCounts.push({
          name: tableName,
          rows: -1,
          error: e.message
        });
      }
    });

    // Sort tables by row count descending
    tableCounts.sort((a, b) => b.rows - a.rows);

    console.log('\n📈 Row Counts by Table:');
    tableCounts.forEach(tc => {
      if (tc.rows === -1) {
        console.log(`  - ${tc.name}: ERROR (${tc.error})`);
      } else {
        console.log(`  - ${tc.name}: ${tc.rows.toLocaleString()} rows`);
      }
    });

    // Run basic integrity check
    console.log('\n🛡️ SQLite Integrity Check:');
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all();
      console.log(`  Result: ${JSON.stringify(integrity)}`);
    } catch (e) {
      console.log(`  Result: FAILED (${e.message})`);
    }

  } catch (err) {
    console.error('❌ Failed to connect/query SQLite database:', err.message);
  }
} else {
  console.log('⚠️ trace_erp.db file does not exist.');
}
