const assert = require('assert');
const Module = require('module');

// Intercept 'node-fetch' to mock network calls
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'node-fetch') {
    return async function (url, options) {
      console.log(`[MOCK FETCH] Called URL: ${url}`);
      
      // PostEx Mock
      if (url.includes('get-order-detail-by-ref-number')) {
        return {
          ok: true,
          json: async () => ({
            statusCode: '200',
            statusMessage: 'Success',
            dist: {
              trackingNumber: 'PK-RECON-9999',
              transactionStatus: 'Fulfilled'
            }
          })
        };
      }
      
      // Shopify Mock
      if (url.includes('fulfillments.json') || url.includes('update_tracking.json') || url.includes('fulfillment_orders.json')) {
        return {
          ok: true,
          json: async () => ({
            fulfillments: [],
            fulfillment_orders: [{ id: 77777, status: 'open', line_items: [] }]
          })
        };
      }
      
      return {
        ok: true,
        json: async () => ({})
      };
    };
  }
  return originalRequire.apply(this, arguments);
};

const db = require('../backend/db');
const { runReconciliation } = require('../backend/scripts/trackingReconciler');

async function test() {
  console.log('🏁 Starting Reconciler Logic Test...');

  // Setup mock store token & candidate order
  db.prepare("UPDATE stores SET postex_token = 'MOCK_POSTEX_TOKEN' WHERE id = 1").run();
  
  // Clean up any existing test orders
  db.prepare("DELETE FROM orders WHERE shopify_order_id = '9999999'").run();
  db.prepare("DELETE FROM tracking_reconciliation_logs WHERE order_ref = 'TEST-RECON-9999'").run();

  // Insert candidate order
  db.prepare(`
    INSERT INTO orders (id, store_id, shopify_order_id, ref_number, delivery_status, fulfillment_status, price, customer_name)
    VALUES (9999999, 1, '9999999', 'TEST-RECON-9999', 'Fulfilled', 'unfulfilled', 1500, 'Test Customer')
  `).run();

  console.log('✅ Created mock candidate order in database.');

  // Run reconciliation
  const result = await runReconciliation();
  console.log('Result of run:', result);

  // Assertions
  const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = 9999999").get();
  console.log('Updated order in DB:', {
    id: updatedOrder.id,
    tracking_number: updatedOrder.tracking_number,
    courier: updatedOrder.courier
  });
  
  assert.strictEqual(updatedOrder.tracking_number, 'PK-RECON-9999');
  assert.strictEqual(updatedOrder.courier, 'PostEx');

  const logEntry = db.prepare("SELECT * FROM tracking_reconciliation_logs WHERE order_id = 9999999").get();
  console.log('Log entry in DB:', logEntry);
  assert.strictEqual(logEntry.status, 'resolved');
  assert.strictEqual(logEntry.order_ref, 'TEST-RECON-9999');

  console.log('🎉 Test assertions passed successfully!');

  // Cleanup
  db.prepare("DELETE FROM orders WHERE id = 9999999").run();
  db.prepare("DELETE FROM tracking_reconciliation_logs WHERE order_id = 9999999").run();
  db.prepare("UPDATE stores SET postex_token = NULL WHERE id = 1").run();
  console.log('🗑️ Cleaned up test database changes.');
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
