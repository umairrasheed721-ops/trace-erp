const fetch = require('node-fetch');

async function testBulkMetrics() {
  const payload = {
    store_id: 1,
    metric_field: 'marketing_spend',
    updates: [
      { date: '2026-04-21', value: 1234 },
      { date: '2026-04-20', value: 5678 }
    ]
  };

  try {
    const res = await fetch('http://localhost:3001/api/reports/bulk-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Bulk Response:', data);
  } catch (e) {
    console.error('Test failed:', e.message);
  }
}

testBulkMetrics();
