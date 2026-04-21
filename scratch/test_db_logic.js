const db = require('../backend/db');

function testDbLogic() {
  const store_id = 1;
  const metric_field = 'marketing_spend';
  const updates = [
    { date: '2026-04-21', value: 9999 },
    { date: '2026-04-20', value: 8888 }
  ];

  try {
    const updateStmt = db.prepare(`
      UPDATE daily_metrics 
      SET ${metric_field} = ? 
      WHERE store_id = ? AND date_string = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO daily_metrics (store_id, date_string, ${metric_field})
      VALUES (?, ?, ?)
    `);
    const checkStmt = db.prepare('SELECT id FROM daily_metrics WHERE store_id = ? AND date_string = ?');

    db.exec('BEGIN TRANSACTION');
    
    for (const update of updates) {
      const { date, value } = update;
      const numValue = parseFloat(value) || 0;
      const check = checkStmt.get(store_id, date);
      
      if (check) {
        updateStmt.run(numValue, store_id, date);
        console.log(`Updated ${date} with ${numValue}`);
      } else {
        insertStmt.run(store_id, date, numValue);
        console.log(`Inserted ${date} with ${numValue}`);
      }
    }

    db.exec('COMMIT');
    console.log('Success!');
    
    // Verify
    const results = db.prepare("SELECT * FROM daily_metrics WHERE date_string IN ('2026-04-21', '2026-04-20')").all();
    console.log('Verification Results:', results);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testDbLogic();
