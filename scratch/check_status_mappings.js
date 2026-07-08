const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log("Status Mappings:");
const rows = db.prepare("SELECT * FROM status_mappings").all();
console.log(JSON.stringify(rows, null, 2));
