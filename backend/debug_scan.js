const db = require('./db');

const store_id = 1; // Assuming store 1
const orders = db.prepare('SELECT id, line_items, product_titles, delivery_status, cost FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL) AND items_count > 0').all(store_id);

console.log('Total orders with zero cost:', orders.length);
if (orders.length > 0) {
    console.log('Sample delivery statuses:', [...new Set(orders.map(o => o.delivery_status))]);
    console.log('Sample product_titles:', orders.slice(0, 3).map(o => o.product_titles));
}

const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
let matchCount = 0;
orders.forEach(o => {
    const itemsStr = o.line_items || o.product_titles;
    if (!itemsStr) return;
    regex.lastIndex = 0;
    while ((match = regex.exec(itemsStr)) !== null) {
        matchCount++;
    }
});
console.log('Total regex matches found:', matchCount);
