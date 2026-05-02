const db = require('../backend/db');
const store_id = 1;
const status = '';
const start_date = '2025-01-01';
const end_date = '2025-12-31';
const limit = 15000;
const offset = 0;

let queryParams = [Number(store_id)];
let whereClauses = ['o.store_id = ?'];

if (status && status !== 'All Statuses' && status !== '') {
    // ... skipping status logic for this test as status is empty
}

if (start_date) { whereClauses.push('o.order_date >= ?'); queryParams.push(start_date); }
if (end_date) { whereClauses.push('o.order_date <= ?'); queryParams.push(end_date); }

const where = whereClauses.join(' AND ');

const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...queryParams);
const orders = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    WHERE ${where}
    ORDER BY o.created_timestamp DESC
    LIMIT ? OFFSET ?
`).all(...queryParams, limit, offset);

console.log('SQL WHERE:', where);
console.log('Params:', queryParams);
console.log('Total Count:', total.count);
console.log('Orders Length:', orders.length);
