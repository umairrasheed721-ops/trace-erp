const { db } = require('../backend/db');
const fetch = require('node-fetch');

// We will start the express app locally on a port to test the webhook endpoint
const express = require('express');
const app = express();
app.use(express.json());

// Load routers
const webhooksRouter = require('../backend/routes/webhooks');
app.use('/api/webhooks', webhooksRouter);

const PORT = 9988;

async function runTest() {
  const server = app.listen(PORT, async () => {
    console.log(`🔌 Local test webhook server listening on port ${PORT}`);

    try {
      // 1. Setup mock order inside tenant default
      console.log('Setting up mock order for webhook test...');
      db.prepare("DELETE FROM orders WHERE tracking_number = 'TRACK_WEBHOOK_1'").run();
      db.prepare("DELETE FROM watchdog_results WHERE tracking_number = 'TRACK_WEBHOOK_1'").run();
      db.prepare("DELETE FROM stores WHERE id = 999").run();

      db.prepare(`
        INSERT OR REPLACE INTO stores (id, shop_domain, store_name, access_token, postex_token)
        VALUES (999, 'mock-watchdog-store.myshopify.com', 'Mock Store', 'mock-token', 'mock-postex-token')
      `).run();

      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, status_date, order_date, delivery_status, ref_number, phone, tenant_id, tracking_history)
        VALUES (999, 'mock-webhook-1', 'TRACK_WEBHOOK_1', 'postex', '2026-06-20 10:00:00', '2026-06-20 09:00:00', 'Dispatched', 'REF-WEBHOOK-1', '03001234567', 'default', '[]')
      `).run();

      // 2. Trigger first webhook event: "Enroute"
      console.log('Sending webhook event: Enroute...');
      const res1 = await fetch(`http://localhost:${PORT}/api/webhooks/postex?token=tracepk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: 'TRACK_WEBHOOK_1',
          transactionStatus: 'Enroute',
          statusDateTime: '2026-06-20 10:15:00'
        })
      });
      console.log('Enroute Webhook Response Status:', res1.status, await res1.json());

      // 3. Trigger second webhook event: "Attempt Failed" (this triggers watchdog)
      console.log('Sending webhook event: Attempted (should trigger watchdog)...');
      const res2 = await fetch(`http://localhost:${PORT}/api/webhooks/postex?token=tracepk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: 'TRACK_WEBHOOK_1',
          transactionStatus: 'Attempted',
          statusDateTime: '2026-06-20 10:25:00' // 10 minutes delta -> Speed Trap FAKE
        })
      });
      console.log('Attempted Webhook Response Status:', res2.status, await res2.json());

      // 4. Verify tracking_history in orders table
      const order = db.prepare("SELECT tracking_history FROM orders WHERE tracking_number = 'TRACK_WEBHOOK_1'").get();
      console.log('Saved tracking history in orders:', order.tracking_history);

      // 5. Verify watchdog_results in watchdog_results table
      const auditResult = db.prepare("SELECT * FROM watchdog_results WHERE tracking_number = 'TRACK_WEBHOOK_1'").get();
      console.log('Audit result in DB:', auditResult);

      // Assertions
      if (auditResult && auditResult.verdict === '🔴 FAKE: IMPOSSIBLE SPEED') {
        console.log('\n🎉 SUCCESS: Webhook automatically triggered offline Watchdog audit in real-time!');
        cleanupAndExit(0);
      } else {
        console.error('\n❌ FAILURE: Real-time webhook watchdog audit failed to save the correct verdict!');
        cleanupAndExit(1);
      }
    } catch (err) {
      console.error('Test execution failed:', err);
      cleanupAndExit(1);
    }
  });

  function cleanupAndExit(code) {
    db.prepare("DELETE FROM orders WHERE tracking_number = 'TRACK_WEBHOOK_1'").run();
    db.prepare("DELETE FROM watchdog_results WHERE tracking_number = 'TRACK_WEBHOOK_1'").run();
    db.prepare("DELETE FROM stores WHERE id = 999").run();
    server.close(() => {
      process.exit(code);
    });
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
