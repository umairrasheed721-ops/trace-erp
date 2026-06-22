const db = require('../backend/db');

try {
  console.log("Inspecting watchdog_results schema...");
  const tableInfo = db.prepare("PRAGMA table_info(watchdog_results)").all();
  console.log("Table info:", tableInfo);

  const createSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watchdog_results'").get();
  console.log("Create SQL:", createSql ? createSql.sql : "Not found");

} catch (err) {
  console.error(err);
}
