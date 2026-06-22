const db = require('../backend/db');
const { runWatchdog } = require('../backend/engines/watchdog');

async function test() {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    if (!store) {
      console.error("Store 1 not found");
      return;
    }

    console.log("Preparing candidate order in database...");
    // Update the only order to be a failed delivery / shipper advice candidate
    db.prepare(`
      UPDATE orders
      SET delivery_status = 'Shipper Advice',
          status_date = '2026-06-16 13:51:04'
      WHERE tracking_number = '20120050024786'
    `).run();

    // Clear previous audit results for this order to ensure it gets audited
    db.prepare(`
      DELETE FROM watchdog_results 
      WHERE tracking_number = '20120050024786'
    `).run();

    console.log("Running watchdog audit engine...");
    const res = await runWatchdog(store);
    console.log("Watchdog run returned:", res);

    console.log("Reading results from watchdog_results table:");
    const dbResults = db.prepare('SELECT * FROM watchdog_results').all();
    console.log(JSON.stringify(dbResults, null, 2));

    // Reset order status back to In Transit for cleanliness if desired, or keep it for manual frontend testing
    console.log("Verification finished successfully!");

  } catch (err) {
    console.error("Verification test failed:", err);
  }
}

test();
