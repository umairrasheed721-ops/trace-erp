const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const rootDbPath = path.join(__dirname, '..', 'trace_erp.db');
const backupDbPath = path.join(__dirname, '..', 'backend', 'backups', 'trace_erp_backup_default_2026-05-30T20-14-00-488Z.db');

const dbs = [
  { name: 'Root trace_erp.db', path: rootDbPath },
  { name: 'Backup trace_erp.db', path: backupDbPath }
];

for (const entry of dbs) {
  try {
    const db = new DatabaseSync(entry.path);
    const count = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    console.log(`${entry.name}: Orders count: ${count}`);
    if (count > 0) {
      const dates = db.prepare('SELECT MIN(order_date) as min_date, MAX(order_date) as max_date FROM orders').get();
      console.log(`  Date Range: ${dates.min_date} to ${dates.max_date}`);
      
      // Let's get unique couriers
      const couriers = db.prepare('SELECT courier, COUNT(*) as count FROM orders GROUP BY courier').all();
      console.log('  Couriers:');
      console.table(couriers);
    }
  } catch (err) {
    console.log(`${entry.name}: Error: ${err.message}`);
  }
}
