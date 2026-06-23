const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  let token = null;

  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        token = data.token;
        break;
      }
    } catch (e) {}
  }

  if (!token) {
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  const storeId = 12; 
  const startDate = '2026-05-01';
  const endDate = '2026-05-31';

  // Fetch all orders in that range
  let allOrders = [];
  let page = 1;
  while (true) {
    const ordersUrl = `${API_BASE}/api/orders?store_id=${storeId}&start_date=${startDate}&end_date=${endDate}&limit=250&page=${page}`;
    const res = await fetch(ordersUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) break;
    const d = await res.json();
    if (!d.orders || d.orders.length === 0) break;
    allOrders = allOrders.concat(d.orders);
    if (allOrders.length >= d.total) break;
    page++;
  }
  console.log(`Fetched ${allOrders.length} orders.`);

  // Audit orders with tracking numbers
  const trackingOrders = allOrders.filter(o => o.tracking_number && o.tracking_number.trim() !== '' && o.tracking_number.trim() !== '—');
  console.log(`Orders with tracking: ${trackingOrders.length}`);

  // Group by raw courier
  const rawCourierGroups = {};
  for (const o of trackingOrders) {
    const raw = o.courier || 'NULL/EMPTY';
    if (!rawCourierGroups[raw]) rawCourierGroups[raw] = [];
    rawCourierGroups[raw].push(o);
  }

  console.log('\n--- Orders with tracking grouped by raw courier field in DB ---');
  for (const raw in rawCourierGroups) {
    console.log(`Raw Courier: "${raw}" | Count: ${rawCourierGroups[raw].length}`);
    // Print 3 samples of tracking numbers
    const samples = rawCourierGroups[raw].slice(0, 5).map(o => `${o.ref_number} (tracking: ${o.tracking_number})`);
    console.log(`  Samples:`, samples);
  }
}

main().catch(err => console.error(err));
