const db = require('./db');
let whereClauses = ['o.store_id = ?'];
let queryParams = [1];

whereClauses.push("LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");

whereClauses.push('o.order_date >= ?'); queryParams.push('2010-01-01');
whereClauses.push('o.order_date <= ?'); queryParams.push('2026-05-06');

const where = whereClauses.join(' AND ');
const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...queryParams);
console.log("SQL:", where);
console.log("Params:", queryParams);
console.log("Total Count:", total.count);
