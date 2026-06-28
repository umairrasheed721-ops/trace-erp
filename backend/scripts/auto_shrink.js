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
  }
} catch (err) {
  console.error("❌ Auto-shrink check failed:", err.message);
}

async function runStartupFix(dbPath) {
  try {
    const fixDb = new DatabaseSync(dbPath);
    const order = fixDb.prepare(`
      SELECT o.id, o.shopify_order_id, o.tracking_number, s.shop_domain, s.access_token 
      FROM orders o 
      JOIN stores s ON o.store_id = s.id 
      WHERE o.ref_number = 'TR32684'
    `).get();

    if (order && order.shopify_order_id && order.access_token && order.access_token !== 'PENDING') {
      const { shop_domain, access_token, shopify_order_id } = order;
      console.log(`🔧 [Startup Fix] Found TR32684, shopify_order_id: ${shopify_order_id}, tracking: ${order.tracking_number}`);
      
      // 1. Fetch fulfillments from Shopify
      const fUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopify_order_id}/fulfillments.json`;
      const res = await globalThis.fetch(fUrl, {
        headers: { 'X-Shopify-Access-Token': access_token }
      });

      if (res.ok) {
        const data = await res.json();
        const fulfillments = data.fulfillments || [];
        const active = fulfillments.filter(f => f.status !== 'cancelled');
        
        console.log(`🔧 [Startup Fix] Found ${active.length} active fulfillments for TR32684 on Shopify.`);
        
        for (const f of active) {
          console.log(`🔧 [Startup Fix] Cancelling fulfillment ${f.id} on Shopify...`);
          const cancelRes = await globalThis.fetch(`https://${shop_domain}/admin/api/2024-10/fulfillments/${f.id}/cancel.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': access_token,
              'Content-Type': 'application/json'
            }
          });
          if (cancelRes.ok) {
            console.log(`🔧 [Startup Fix] Successfully cancelled fulfillment ${f.id} on Shopify.`);
          } else {
            console.error(`🔧 [Startup Fix] Failed to cancel fulfillment ${f.id}:`, await cancelRes.text());
          }
        }
      } else {
        console.error(`🔧 [Startup Fix] Failed to get fulfillments for TR32684:`, await res.text());
      }

      // 2. Clear tracking in DB and set status to Confirmed (Ready to Book)
      fixDb.prepare(`
        UPDATE orders 
        SET tracking_number = NULL, courier = NULL, delivery_status = 'Confirmed', status_date = datetime('now') 
        WHERE id = ?
      `).run(order.id);
      console.log(`🔧 [Startup Fix] Successfully updated order TR32684 to Confirmed & cleared tracking in database.`);
    }
    fixDb.close();
  } catch (err) {
    console.error("🔧 [Startup Fix] Failed to run TR32684 fix:", err.message);
  }
}

runStartupFix(dbPath).finally(() => {
  process.exit(0);
});
