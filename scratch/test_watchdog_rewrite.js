const db = require('../backend/db');
const Module = require('module');

const mockResponses = {
  'TRACK_IMPOSSIBLE': {
    transactionStatus: 'Delivery Failed',
    trackingHistory: [
      { dateTime: '2026-06-18 10:00:00', transactionStatus: 'Enroute' },
      { dateTime: '2026-06-18 10:10:00', transactionStatus: 'Attempt Failed' }
    ]
  },
  'TRACK_NIGHT': {
    transactionStatus: 'Delivery Failed',
    trackingHistory: [
      { dateTime: '2026-06-18 10:00:00', transactionStatus: 'Enroute' },
      { dateTime: '2026-06-18 21:15:00', transactionStatus: 'Attempt Failed' }
    ]
  },
  'TRACK_INSTANT': {
    transactionStatus: 'Delivery Failed',
    trackingHistory: [
      { dateTime: '2026-06-18 10:00:00', transactionStatus: 'Enroute' },
      { dateTime: '2026-06-18 10:00:00', transactionStatus: 'Attempt Failed' }
    ]
  },
  'TRACK_VERIFIED': {
    transactionStatus: 'Delivery Failed',
    trackingHistory: [
      { dateTime: '2026-06-18 10:00:00', transactionStatus: 'Enroute' },
      { dateTime: '2026-06-18 12:30:00', transactionStatus: 'Attempt Failed' }
    ]
  }
};

const mockFetch = async (url, options) => {
  console.log(`[Mock Fetch] Intercepted tracking request: ${url}`);
  const trackingNumber = url.split('/').pop();
  const mockData = mockResponses[trackingNumber];
  if (mockData) {
    return {
      status: 200,
      ok: true,
      json: async () => ({ dist: mockData })
    };
  }
  return { status: 404, ok: false };
};

// 💉 Prototype override for absolute mocking
const originalRequire = Module.prototype.require;
Module.prototype.require = function(name) {
  if (name === 'node-fetch') {
    return mockFetch;
  }
  return originalRequire.apply(this, arguments);
};

// Clear cache for modules to ensure mock fetch is used
delete require.cache[require.resolve('../backend/engines/tracking/postex')];
delete require.cache[require.resolve('../backend/engines/watchdog')];

const { syncPostEx } = require('../backend/engines/tracking/postex');

async function runTest() {
  console.log('🧪 Starting Integrated Sync-Watchdog Test (Mocked fetch)...');

  // Setup mock store if not exists
  let store = db.prepare('SELECT * FROM stores WHERE id = 999').get();
  if (!store) {
    console.log('Creating mock store ID 999...');
    db.prepare(`
      INSERT OR REPLACE INTO stores (id, shop_domain, store_name, access_token, postex_token)
      VALUES (999, 'mock-watchdog-store.myshopify.com', 'Mock Store', 'mock-token', 'mock-postex-token')
    `).run();
    store = db.prepare('SELECT * FROM stores WHERE id = 999').get();
  }

  // Clear existing orders for store 999
  db.prepare('DELETE FROM orders WHERE store_id = 999').run();
  db.prepare('DELETE FROM watchdog_results WHERE store_id = 999').run();

  // Create test candidate orders
  const testCandidates = [
    { tracking: 'TRACK_IMPOSSIBLE', status_date: '2026-06-18 09:00:00', delivery_status: 'Attempted' },
    { tracking: 'TRACK_NIGHT', status_date: '2026-06-18 09:00:00', delivery_status: 'Attempted' },
    { tracking: 'TRACK_INSTANT', status_date: '2026-06-18 09:00:00', delivery_status: 'Attempted' },
    { tracking: 'TRACK_VERIFIED', status_date: '2026-06-18 09:00:00', delivery_status: 'Attempted' }
  ];

  for (let i = 0; i < testCandidates.length; i++) {
    const c = testCandidates[i];
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, status_date, delivery_status, ref_number, phone, tenant_id)
      VALUES (?, ?, ?, 'postex', ?, ?, ?, '03001234567', 'default')
    `).run(999, `mock-order-${i}`, c.tracking, c.status_date, c.delivery_status, `REF-${c.tracking}`);
  }

  console.log('Running syncPostEx sync tracking engine...');
  const syncRes = await syncPostEx(store, 'FULL');
  console.log('Sync completed:', syncRes);

  const results = db.prepare('SELECT * FROM watchdog_results WHERE store_id = 999').all();
  console.log('\n📊 Watchdog Results written to DB during sync:');
  console.table(results.map(r => ({
    tracking: r.tracking_number,
    verdict: r.verdict,
    duration: r.duration,
    evidence: r.evidence
  })));

  // Assertions
  const cases = {
    'TRACK_IMPOSSIBLE': '🔴 FAKE: IMPOSSIBLE SPEED',
    'TRACK_NIGHT': '🟠 SUSPICIOUS: LATE BULK CLOSE',
    'TRACK_INSTANT': '🔴 FAKE: INSTANT CLOSE',
    'TRACK_VERIFIED': '🟢 VERIFIED ATTEMPT'
  };

  let allPassed = true;
  for (const r of results) {
    const expectedVerdict = cases[r.tracking_number];
    if (r.verdict === expectedVerdict) {
      console.log(`✅ Passed: ${r.tracking_number} -> ${r.verdict}`);
    } else {
      console.error(`❌ Failed: ${r.tracking_number}. Expected: "${expectedVerdict}", Got: "${r.verdict}"`);
      allPassed = false;
    }
  }

  // Cleanup
  db.prepare('DELETE FROM orders WHERE store_id = 999').run();
  db.prepare('DELETE FROM watchdog_results WHERE store_id = 999').run();
  db.prepare('DELETE FROM stores WHERE id = 999').run();

  if (allPassed && results.length === 4) {
    console.log('\n🎉 ALL INTEGRATED SYNC-WATCHDOG REWRITE TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error(`\n⚠️ SOME WATCHDOG TESTS FAILED! (Got ${results.length} results, expected 4)`);
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
