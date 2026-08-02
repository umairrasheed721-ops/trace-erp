const { db } = require('../backend/db');

const rows = db.prepare(`
  SELECT date_string, actual_exp
  FROM daily_metrics
  WHERE actual_exp > 0
  ORDER BY date_string DESC
`).all();

console.log("Daily Metrics with actual_exp > 0:", rows);
