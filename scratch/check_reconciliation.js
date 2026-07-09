const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- CPR Settlement Orders ---');
try {
  const cprOrders = db.prepare('SELECT * FROM cpr_settlement_orders WHERE order_ref LIKE ? OR tracking_number LIKE ?').all('%29159%', '%29159%');
  console.log(cprOrders);
} catch (e) {
  console.error(e.message);
}

console.log('--- Order History Logs ---');
try {
  const history = db.prepare('SELECT * FROM order_history WHERE order_id IN (SELECT id FROM orders WHERE ref_number LIKE ?)').all('%29159%');
  console.log(history);
} catch (e) {
  console.error(e.message);
}
