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

  console.log(`🔐 Logged in successfully to production API.`);

  const storeId = 12; 
  const startDate = '2026-05-01';
  const endDate = '2026-05-31';

  // 1. Fetch Logistics Intelligence (Courier Intelligence)
  const liUrl = `${API_BASE}/api/reports/logistics-intelligence?store_id=${storeId}&startDate=${startDate}&endDate=${endDate}`;
  console.log(`📡 Fetching Logistics Intelligence from: ${liUrl}`);
  const liRes = await fetch(liUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!liRes.ok) {
    console.error('Logistics Intelligence failed:', liRes.statusText);
    return;
  }
  const liData = await liRes.json();
  console.log('\n--- Courier Intelligence Data ---');
  console.log('Profit by Courier:');
  console.table(liData.profitByCourier || []);
  
  const totalLandedInCourierIntel = (liData.profitByCourier || []).reduce((acc, row) => acc + (row.total_landed || 0), 0);
  console.log(`Total Landed orders in Courier Intelligence table: ${totalLandedInCourierIntel}`);

  // 2. Fetch daily report (Main dashboard metrics) - using start_date and end_date
  const dailyUrl = `${API_BASE}/api/reports/daily?store_id=${storeId}&start_date=${startDate}&end_date=${endDate}`;
  console.log(`\n📡 Fetching Daily Report (Dashboard) from: ${dailyUrl}`);
  const dailyRes = await fetch(dailyUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!dailyRes.ok) {
    console.error('Daily Report failed:', dailyRes.statusText);
    return;
  }
  const dailyData = await dailyRes.json();
  
  // Calculate total orders in Dashboard
  const totalOrdersInDashboard = (dailyData.dailyData || []).reduce((acc, row) => acc + (row.landed_orders || 0), 0);
  console.log(`Total orders in Main Dashboard (P&L): ${totalOrdersInDashboard}`);

  // Let's fetch all orders in May 2026 for this store
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
  console.log(`\nRaw API Orders fetched: ${allOrders.length}`);

  // Audit: trace why some orders are not showing in Courier Intelligence
  console.log('\n--- Auditing Orders for Exclusions ---');
  let missingTracking = 0;
  let excludedCouriers = {};
  
  for (const o of allOrders) {
    const hasTracking = o.tracking_number && o.tracking_number.trim() !== '' && o.tracking_number.trim() !== '—';
    const rawCourier = o.courier;
    
    // Map courier
    let mappedCourier = 'Unknown';
    if (rawCourier) {
      const upper = rawCourier.toUpperCase();
      if (upper.includes('POSTEX') || upper.includes('POST EX')) mappedCourier = 'PostEx';
      else if (upper.includes('LCS') || upper.includes('LEOPARD')) mappedCourier = 'Leopards';
      else if (upper.includes('TCS')) mappedCourier = 'TCS';
      else if (upper.includes('INSTA') || upper.includes('INSTAWORLD') || upper.includes('INSTA WORLD') || upper.includes('ILOGISTIC')) mappedCourier = 'InstaLogistics';
      else if (/[0-9]/.test(rawCourier) && rawCourier.trim().length < 6) mappedCourier = 'PostEx';
      else mappedCourier = rawCourier.trim();
    } else {
      mappedCourier = hasTracking ? 'PostEx' : 'Unassigned';
    }

    if (mappedCourier === 'Unassigned' || mappedCourier === 'Unknown') {
      const trackingClean = (o.tracking_number || '').trim().toLowerCase();
      const selfKeywords = ['hand', 'self', 'rider', 'local', 'office', 'pickup', 'personal'];
      const datePattern = /^(?:\d{1,4})[./-]\d{1,2}[./-](?:\d{1,4})$/;
      if (selfKeywords.some(kw => trackingClean.includes(kw)) || datePattern.test(trackingClean)) {
        mappedCourier = 'Self Delivery';
      }
    }

    if (!hasTracking) {
      missingTracking++;
    } else {
      // Find if this courier was mapped in profitByCourier
      const inProfitTable = (liData.profitByCourier || []).some(row => row.courier_name === mappedCourier);
      if (!inProfitTable) {
        if (!excludedCouriers[mappedCourier]) {
          excludedCouriers[mappedCourier] = [];
        }
        excludedCouriers[mappedCourier].push(o);
      }
    }
  }

  console.log(`Orders missing tracking number (fully excluded from Courier Intelligence): ${missingTracking}`);
  console.log('Excluded Couriers (have tracking, but not in Courier Intelligence table):');
  for (const courier in excludedCouriers) {
    console.log(`  Courier: ${courier} | Count: ${excludedCouriers[courier].length}`);
    console.log('  Sample order IDs:', excludedCouriers[courier].slice(0, 5).map(o => `${o.ref_number} (${o.delivery_status})`));
  }
}

main().catch(err => {
  console.error(err);
});
