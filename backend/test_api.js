const sqlite = require('better-sqlite3');
const db = new sqlite('trace_erp.db');

const store_id = 1;
const start_date = '2010-01-01';
const end_date = '2026-05-14';

let queryParams = [Number(store_id)];
let whereClauses = ['o.store_id = ?'];

if (start_date) { whereClauses.push('o.order_date >= ?'); queryParams.push(start_date); }
if (end_date) { whereClauses.push('o.order_date <= ?'); queryParams.push(end_date); }

const where = whereClauses.join(' AND ');
console.log("WHERE:", where);
console.log("PARAMS:", queryParams);

const t1 = Date.now();
const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...queryParams);
console.log("COUNT:", total.count, "Time:", Date.now() - t1, "ms");

const t2 = Date.now();
const orders = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    WHERE ${where}
    ORDER BY o.created_timestamp DESC
    LIMIT 250 OFFSET 0
`).all(...queryParams);
console.log("ORDERS LENGTH:", orders.length, "Time:", Date.now() - t2, "ms");
