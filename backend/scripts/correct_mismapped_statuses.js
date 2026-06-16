const sqlite = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbs = ['trace_erp.db', 'trace_erp_db.db', 'trace_erp_tenant_abc.db', 'trace_erp_tenant_b.db'];
const targetDir = path.resolve(__dirname, '..');

function loadStatusMaps(db) {
  const rows = db.prepare('SELECT courier, courier_status, erp_status FROM status_mappings WHERE is_active = 1').all();
  const map = {};
  rows.forEach(r => {
    const key = `${r.courier.toLowerCase()}:${r.courier_status.toLowerCase().trim()}`;
    map[key] = r.erp_status;
    map[`all:${r.courier_status.toLowerCase().trim()}`] = r.erp_status;
  });
  return map;
}

function applyMap(statusMap, courierName, raw) {
  if (!raw) return null;
  const rawClean = String(raw).toLowerCase().trim();
  const courierKey = `${(courierName||'all').toLowerCase()}:${rawClean}`;
  const allKey = `all:${rawClean}`;
  return statusMap[courierKey] || statusMap[allKey] || null;
}

dbs.forEach(dbName => {
  const dbPath = path.join(targetDir, dbName);
  if (!fs.existsSync(dbPath)) return;
  try {
    const db = new sqlite.DatabaseSync(dbPath);
    console.log(`⚡ Checking local mappings in ${dbName}...`);
    
    const statusMap = loadStatusMaps(db);
    const orders = db.prepare(`
      SELECT id, tracking_number, courier, courier_status, delivery_status 
      FROM orders 
      WHERE courier_status IS NOT NULL AND courier_status != ''
    `).all();
    
    let updated = 0;
    const updateStmt = db.prepare(`
      UPDATE orders SET delivery_status = ?, status_date = datetime('now') WHERE id = ?
    `);
    
    const updates = [];
    orders.forEach(order => {
      const mapped = applyMap(statusMap, order.courier, order.courier_status);
      if (mapped && mapped !== order.delivery_status) {
        console.log(`  Order ${order.id}: "${order.courier_status}" (current erp: "${order.delivery_status}" -> mapped: "${mapped}")`);
        updates.push({ id: order.id, newStatus: mapped });
        updated++;
      }
    });
    
    if (updates.length > 0) {
      db.exec('BEGIN');
      try {
        updates.forEach(u => {
          updateStmt.run(u.newStatus, u.id);
        });
        db.exec('COMMIT');
        console.log(`✅ Updated ${updated} orders in ${dbName}`);
      } catch (transError) {
        db.exec('ROLLBACK');
        throw transError;
      }
    } else {
      console.log(`ℹ️ No mismatched orders found in ${dbName}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${dbName}:`, err.message);
  }
});
