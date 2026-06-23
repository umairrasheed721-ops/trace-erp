const db = require('../backend/db');

const rows = db.prepare('SELECT id, tracking_number, courier FROM orders LIMIT 20').all();
console.log('Sample rows:', rows);

const specific = db.prepare("SELECT id, tracking_number, courier FROM orders WHERE tracking_number LIKE '%hand%' OR tracking_number LIKE '%/%'").all();
console.log('Specific matches:', specific);
