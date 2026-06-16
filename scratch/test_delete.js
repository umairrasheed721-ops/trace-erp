const DatabaseSync = require('node:sqlite').DatabaseSync;
const fs = require('fs');
const path = require('path');

const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
try {
  const conn = new DatabaseSync(dbPath);
  const triggers = conn.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all();
  console.log("Database Triggers:");
  console.log(JSON.stringify(triggers, null, 2));
  conn.close();
} catch (e) {
  console.error(e);
}
