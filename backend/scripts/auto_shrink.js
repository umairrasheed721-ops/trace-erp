const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../trace_erp.db');

if (!fs.existsSync(dbPath)) {
  console.log("📊 Database file does not exist yet. Skipping auto-shrink check.");
  process.exit(0);
}

try {
  const stats = fs.statSync(dbPath);
  const sizeMB = stats.size / 1024 / 1024;
  console.log(`📊 Database size: ${sizeMB.toFixed(2)} MB`);

  if (sizeMB > 200) {
    console.log("⚠️ Database size is larger than 200MB. Inspecting logs...");
    const checkDb = new DatabaseSync(dbPath);
    
    // Check if system_logs table exists and has rows
    const logTableExists = checkDb.prepare(`
      SELECT 1 FROM sqlite_master 
      WHERE type='table' AND name='system_logs'
    `).get();
    
    let shouldShrink = false;
    if (logTableExists) {
      const hasLogs = checkDb.prepare("SELECT 1 FROM system_logs LIMIT 1").get();
      if (hasLogs) {
        shouldShrink = true;
      }
    }
    
    // Close connection before modifying the files
    checkDb.close();

    if (shouldShrink) {
      console.log("🚨 Bloated system logs detected! Automatically shrinking database to reclaim space...");
      
      const oldDbPath = dbPath;
      const tempDbPath = dbPath + '_temp';
      const backupDbPath = dbPath + '_backup';

      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }

      // Create fresh temp database
      const tempDb = new DatabaseSync(tempDbPath);
      tempDb.exec("PRAGMA journal_mode = WAL");
      tempDb.exec("PRAGMA synchronous = NORMAL");

      // Attach old DB
      tempDb.exec(`ATTACH DATABASE '${oldDbPath}' AS oldDb`);

      // Query schemas
      const schemas = tempDb.prepare(`
        SELECT type, name, tbl_name, sql 
        FROM oldDb.sqlite_master 
        WHERE sql IS NOT NULL 
          AND tbl_name != 'system_logs'
          AND name NOT LIKE 'sqlite_%'
      `).all();

      const tables = schemas.filter(s => s.type === 'table');
      const others = schemas.filter(s => s.type !== 'table');

      // Create tables
      for (const tbl of tables) {
        tempDb.exec(tbl.sql);
      }

      // Copy data
      tempDb.exec("PRAGMA foreign_keys = OFF");
      for (const tbl of tables) {
        const tableName = tbl.name;
        tempDb.exec(`INSERT INTO main.${tableName} SELECT * FROM oldDb.${tableName}`);
      }

      // Copy sequence
      try {
        tempDb.exec("DELETE FROM main.sqlite_sequence");
        tempDb.exec("INSERT INTO main.sqlite_sequence SELECT * FROM oldDb.sqlite_sequence");
      } catch (_) {}
      tempDb.exec("PRAGMA foreign_keys = ON");

      // Create other objects
      for (const item of others) {
        try { tempDb.exec(item.sql); } catch (_) {}
      }

      // Performance index
      try {
        tempDb.exec("CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_timestamp DESC);");
        tempDb.exec("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_timestamp DESC);");
      } catch (_) {}

      // Detach and close
      tempDb.exec("DETACH DATABASE oldDb");
      tempDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      tempDb.close();

      // Clean WAL and SHM
      const walFile = oldDbPath + '-wal';
      const shmFile = oldDbPath + '-shm';
      if (fs.existsSync(walFile)) { try { fs.unlinkSync(walFile); } catch (_) {} }
      if (fs.existsSync(shmFile)) { try { fs.unlinkSync(shmFile); } catch (_) {} }

      // Backup old DB
      if (fs.existsSync(backupDbPath)) {
        fs.unlinkSync(backupDbPath);
      }
      fs.renameSync(oldDbPath, backupDbPath);
      
      // Swap temp in place
      fs.renameSync(tempDbPath, oldDbPath);
      
      // Delete backup to free up disk space immediately
      fs.unlinkSync(backupDbPath);

      console.log("🎉 Database auto-shrink completed successfully! Space reclaimed.");
    } else {
      console.log("✅ Database size is normal or logs are already clean. Skipping shrink.");
    }
  } else {
    console.log("✅ Database size is normal. Skipping shrink.");
  }
} catch (err) {
  console.error("❌ Auto-shrink check failed:", err.message);
}
process.exit(0);
