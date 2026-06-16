const sqlite = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbs = ['trace_erp.db', 'trace_erp_db.db', 'trace_erp_tenant_abc.db', 'trace_erp_tenant_b.db'];
const targetDir = path.resolve(__dirname, '..');

dbs.forEach(dbName => {
  const dbPath = path.join(targetDir, dbName);
  if (!fs.existsSync(dbPath)) {
    console.log(`⚠️ Database file ${dbName} does not exist. Skipping.`);
    return;
  }
  try {
    const db = new sqlite.DatabaseSync(dbPath);
    console.log(`⚡ Updating status mappings in ${dbName}...`);
    
    // Insert/replace for 'all' and 'LCS'
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO status_mappings (courier, courier_status, erp_status, is_active)
      VALUES (?, ?, ?, 1)
    `);
    
    stmt.run('all', 'return to origin', 'Returned');
    stmt.run('LCS', 'return to origin', 'Returned');
    
    console.log(`✅ Successfully updated ${dbName}`);
  } catch (err) {
    console.error(`❌ Failed to update ${dbName}:`, err.message);
  }
});
