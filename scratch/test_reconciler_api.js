const assert = require('assert');
const router = require('../backend/routes/sync');

console.log('🏁 Starting API Route Registration Test...');

// Verify /reconciliation/stats endpoint registration
const statsRoute = router.stack.find(s => s.route && s.route.path === '/reconciliation/stats');
assert.ok(statsRoute, 'GET /reconciliation/stats route should be registered');
assert.strictEqual(statsRoute.route.methods.get, true, 'GET method should be supported');

// Verify /reconciliation/run endpoint registration
const runRoute = router.stack.find(s => s.route && s.route.path === '/reconciliation/run');
assert.ok(runRoute, 'POST /reconciliation/run route should be registered');
assert.strictEqual(runRoute.route.methods.post, true, 'POST method should be supported');

console.log('✅ Both routes are registered correctly.');

// Mock DB candidate order for testing route handler logic
const db = require('../backend/db');
db.prepare("DELETE FROM orders WHERE shopify_order_id = '8888888'").run();
db.prepare("DELETE FROM tracking_reconciliation_logs WHERE order_ref = 'TEST-API-8888'").run();

// Insert candidate order
db.prepare(`
  INSERT INTO orders (id, store_id, shopify_order_id, ref_number, delivery_status, fulfillment_status, price, customer_name)
  VALUES (8888888, 1, '8888888', 'TEST-API-8888', 'Fulfilled', 'unfulfilled', 1000, 'Route Test Customer')
`).run();

// Execute stats handler manually
console.log('Testing GET /reconciliation/stats handler...');
const req = {};
const res = {
  json: (data) => {
    console.log('Handler response data:', data);
    assert.strictEqual(data.success, true);
    assert.ok('metrics' in data, 'response should contain metrics');
    assert.ok(data.metrics.pending >= 1, 'metrics.pending should be at least 1');
    assert.ok('orphanedList' in data, 'response should contain orphanedList');
    console.log('🎉 Route handler test passed successfully!');
    
    // Clean up
    db.prepare("DELETE FROM orders WHERE id = 8888888").run();
    console.log('🗑️ Cleaned up test database changes.');
  },
  status: (code) => {
    console.error('Failed with status code:', code);
    return res;
  }
};

const handler = statsRoute.route.stack[0].handle;
handler(req, res);
