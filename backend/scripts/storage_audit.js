const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function runStorageAudit(shouldLog = true) {
  const result = {
    success: false,
    directory: null,
    files: [],
    tables: [],
    integrity: null,
    error: null
  };

  try {
    const isProduction = process.env.NODE_ENV === 'production' || 
                         process.env.RAILWAY_ENVIRONMENT !== undefined ||
                         process.env.BOT_ENABLED === 'true';

    const defaultDbPath = isProduction 
      ? '/app/data/trace_erp.db' 
      : path.join(__dirname, '..', 'trace_erp.db');
    const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);
    const DB_DIR = path.dirname(DB_PATH);
    result.directory = DB_DIR;

    if (shouldLog) console.log('🔍 --- PRODUCTION STORAGE AUDIT --- 🔍');
    if (shouldLog) console.log(`📂 Auditing directory: ${DB_DIR}`);

    // 1. Filesystem audit
    if (fs.existsSync(DB_DIR)) {
      try {
        const files = fs.readdirSync(DB_DIR);
        const fileDetails = files.map(file => {
          const filePath = path.join(DB_DIR, file);
          const stat = fs.statSync(filePath);
          return {
            name: file,
            sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(3)),
            sizeBytes: stat.size
          };
        });

        // Sort files by size descending
        fileDetails.sort((a, b) => b.sizeBytes - a.sizeBytes);
        result.files = fileDetails;

        if (shouldLog) {
          console.log('\n📁 Files by Size in Database Directory:');
          fileDetails.forEach(f => {
            console.log(`  - ${f.name}: ${f.sizeMB} MB`);
          });
        }
      } catch (err) {
        if (shouldLog) console.error('❌ Failed to read directory files:', err.message);
      }
    } else {
      if (shouldLog) console.log('⚠️ Database directory does not exist yet.');
    }

    // 2. Database internal table audit
    if (fs.existsSync(DB_PATH)) {
      if (shouldLog) console.log(`\n🔌 Auditing Database File: ${DB_PATH}`);
      try {
        const db = new DatabaseSync(DB_PATH);
        
        // Get all tables
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (shouldLog) console.log(`📊 Found ${tables.length} tables. Auditing row counts...`);

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
            tableCounts.push({
              name: tableName,
              rows: -1,
              error: e.message
            });
          }
        });

        // Sort tables by row count descending
        tableCounts.sort((a, b) => b.rows - a.rows);
        result.tables = tableCounts;

        if (shouldLog) {
          console.log('\n📈 Row Counts by Table:');
          tableCounts.forEach(tc => {
            if (tc.rows === -1) {
              console.log(`  - ${tc.name}: ERROR (${tc.error})`);
            } else {
              console.log(`  - ${tc.name}: ${tc.rows.toLocaleString()} rows`);
            }
          });
        }

        // Run basic integrity check
        if (shouldLog) console.log('\n🛡️ SQLite Integrity Check:');
        try {
          const integrity = db.prepare('PRAGMA integrity_check').all();
          result.integrity = integrity;
          if (shouldLog) console.log(`  Result: ${JSON.stringify(integrity)}`);
        } catch (e) {
          result.integrity = `FAILED (${e.message})`;
          if (shouldLog) console.log(`  Result: FAILED (${e.message})`);
        }

      } catch (err) {
        if (shouldLog) console.error('❌ Failed to connect/query SQLite database:', err.message);
      }
    } else {
      if (shouldLog) console.log('⚠️ trace_erp.db file does not exist.');
    }

    result.success = true;
  } catch (globalErr) {
    result.error = globalErr.message;
    if (shouldLog) console.error('❌ Global Storage Audit Error:', globalErr.message);
  }

  return result;
}

module.exports = { runStorageAudit };

if (require.main === module) {
  runStorageAudit(true);
}
