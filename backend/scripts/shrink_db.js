const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const oldDbPath = path.join(__dirname, '../trace_erp_backup.db');
const tempDbPath = path.join(__dirname, '../trace_erp_temp.db');
const finalDbPath = path.join(__dirname, '../trace_erp.db');

console.log("=== SQLite Database Direct Schema Copy & Shrink ===");
console.log(`Source DB (Bloated Backup): ${oldDbPath}`);
console.log(`Temp DB:                    ${tempDbPath}`);
console.log(`Final DB:                   ${finalDbPath}`);

if (!fs.existsSync(oldDbPath)) {
  console.error("❌ ERROR: Bloated backup database does not exist!");
  process.exit(1);
}

// 1. Remove existing temp database if it exists
if (fs.existsSync(tempDbPath)) {
  fs.unlinkSync(tempDbPath);
  console.log("🧹 Removed existing temporary database file.");
}

// 2. Open fresh connection to temp database (completely empty, no schema initialization)
const tempDb = new DatabaseSync(tempDbPath);
console.log("✅ Created empty temp database.");

// 3. Optimize connection
tempDb.exec("PRAGMA journal_mode = WAL");
tempDb.exec("PRAGMA synchronous = NORMAL");

// 4. Attach the backup database
console.log("\n1. Attaching source database...");
tempDb.exec(`ATTACH DATABASE '${oldDbPath}' AS oldDb`);
console.log("   ✅ Attached.");

// 5. Query all schemas from the old database (tables, indexes, triggers, views)
// Filter out anything related to 'system_logs' and internal 'sqlite_' schemas
const schemas = tempDb.prepare(`
  SELECT type, name, tbl_name, sql 
  FROM oldDb.sqlite_master 
  WHERE sql IS NOT NULL 
    AND tbl_name != 'system_logs'
    AND name NOT LIKE 'sqlite_%'
`).all();

const tables = schemas.filter(s => s.type === 'table');
const others = schemas.filter(s => s.type !== 'table');

console.log(`\n2. Found ${tables.length} tables and ${others.length} other schema elements to copy.`);

// 6. Create tables in main schema
console.log("\n3. Creating tables...");
for (const tbl of tables) {
  console.log(`   - Creating table '${tbl.name}'...`);
  try {
    tempDb.exec(tbl.sql);
  } catch (err) {
    console.error(`   ❌ ERROR creating table '${tbl.name}':`, err.message);
  }
}

// 7. Disable foreign key checks for bulk data copy
tempDb.exec("PRAGMA foreign_keys = OFF");

// 8. Copy data for each table
console.log("\n4. Copying table data...");
for (const tbl of tables) {
  const tableName = tbl.name;
  console.log(`   - Copying data for '${tableName}'...`);
  try {
    tempDb.exec(`INSERT INTO main.${tableName} SELECT * FROM oldDb.${tableName}`);
    const count = tempDb.prepare(`SELECT COUNT(*) as count FROM main.${tableName}`).get().count;
    console.log(`     ✅ Copied ${count} rows.`);
  } catch (err) {
    console.error(`     ❌ ERROR copying data for '${tableName}':`, err.message);
  }
}

// 9. Copy sqlite_sequence (autoincrement sequence tracker)
console.log("\n5. Copying autoincrement sequences...");
try {
  tempDb.exec("DELETE FROM main.sqlite_sequence");
  tempDb.exec("INSERT INTO main.sqlite_sequence SELECT * FROM oldDb.sqlite_sequence");
  console.log("   ✅ sqlite_sequence copied.");
} catch (err) {
  console.log("   ⚠️ sqlite_sequence copy skipped/failed:", err.message);
}

tempDb.exec("PRAGMA foreign_keys = ON");

// 10. Create indexes, triggers, and views
console.log("\n6. Creating indices, triggers, and views...");
for (const item of others) {
  console.log(`   - Creating ${item.type} '${item.name}'...`);
  try {
    tempDb.exec(item.sql);
  } catch (err) {
    // If it's a duplicate index/trigger, skip
    console.log(`     ⚠️ skipped/failed: ${err.message}`);
  }
}

// 11. Add our new performance index
console.log("\n7. Creating performance indexes...");
try {
  tempDb.exec("CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_timestamp DESC);");
  tempDb.exec("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_timestamp DESC);");
  console.log("   ✅ Performance indexes created successfully.");
} catch (err) {
  console.error("   ❌ Failed to create performance indexes:", err.message);
}

// 12. Detach old database
console.log("\n8. Detaching source database and checkpointing...");
try {
  tempDb.exec("DETACH DATABASE oldDb");
  tempDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  console.log("   ✅ Detached and checkpointed.");
} catch (err) {
  console.error("   ❌ Error during detach/checkpoint:", err.message);
}

// 13. Close connection
console.log("\n9. Closing database connection...");
if (typeof tempDb.close === 'function') {
  tempDb.close();
}
console.log("   ✅ Database connection closed.");

// 14. Swap files
console.log("\n10. Swapping database files...");
if (fs.existsSync(finalDbPath)) {
  fs.unlinkSync(finalDbPath);
  console.log("   🧹 Removed temporary/failed final DB.");
}

// Remove WAL and SHM files of final DB if any
const walFile = finalDbPath + '-wal';
const shmFile = finalDbPath + '-shm';
if (fs.existsSync(walFile)) {
  try { fs.unlinkSync(walFile); console.log("   🧹 Removed WAL file."); } catch (_) {}
}
if (fs.existsSync(shmFile)) {
  try { fs.unlinkSync(shmFile); console.log("   🧹 Removed SHM file."); } catch (_) {}
}

// Rename temp database to final
fs.renameSync(tempDbPath, finalDbPath);
console.log(`   ✅ Swapped trace_erp_temp.db to trace_erp.db`);

console.log("\n🎉 Database shrink completed successfully!");
