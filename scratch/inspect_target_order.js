const db = require('../backend/db');

const count = db.prepare("SELECT COUNT(*) as cnt FROM orders").get();
console.log("Total orders in database:", count.cnt);

const sample = db.prepare("SELECT * FROM orders LIMIT 10").all();
console.log("Sample orders:", JSON.stringify(sample, null, 2));
