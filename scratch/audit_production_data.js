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

  // Fetch all orders for store_id = 1
  console.log('📡 Fetching orders from production...');
  const exportRes = await fetch(`${API_BASE}/api/orders/export?store_id=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!exportRes.ok) {
    console.error(`❌ Failed to export orders: ${exportRes.statusText}`);
    return;
  }

  const orders = await exportRes.json();
  console.log(`Total orders fetched: ${orders.length}`);

  // Filter orders for May 2026
  const start = new Date('2026-05-01T00:00:00');
  const end = new Date('2026-05-31T23:59:59');
  
  const mayOrders = orders.filter(o => {
    if (!o.order_date) return false;
    const date = new Date(o.order_date);
    return date >= start && date <= end;
  });

  console.log(`May 2026 orders count: ${mayOrders.length}`);

  // Let's audit the raw courier and tracking numbers
  const courierStats = {};
  const unassignedOrders = [];

  for (const o of mayOrders) {
    const rawCourier = o.courier;
    const tracking = o.tracking_number;
    const status = o.delivery_status;

    // Categorize using reports.js logic
    let mappedCourier = 'Unknown';
    if (rawCourier) {
      const upper = rawCourier.toUpperCase();
      if (upper.includes('POSTEX') || upper.includes('POST EX')) {
        mappedCourier = 'PostEx';
      } else if (upper.includes('LCS') || upper.includes('LEOPARD')) {
        mappedCourier = 'Leopards';
      } else if (upper.includes('TCS')) {
        mappedCourier = 'TCS';
      } else if (upper.includes('INSTA') || upper.includes('INSTAWORLD') || upper.includes('INSTA WORLD') || upper.includes('ILOGISTIC')) {
        mappedCourier = 'InstaLogistics';
      } else if (/[0-9]/.test(rawCourier) && rawCourier.trim().length < 6) {
        mappedCourier = 'PostEx';
      } else {
        mappedCourier = rawCourier.trim();
      }
    } else {
      // If courier is null/empty but has tracking number
      if (tracking && tracking.trim() !== '') {
        mappedCourier = 'PostEx'; // falls back to PostEx if null/empty
      } else {
        mappedCourier = 'PostEx'; // reports.js fallback
      }
    }

    if (!courierStats[mappedCourier]) {
      courierStats[mappedCourier] = {
        total: 0,
        with_tracking: 0,
        without_tracking: 0,
        statuses: {}
      };
    }

    courierStats[mappedCourier].total++;
    if (tracking && tracking.trim() !== '' && tracking.trim() !== '—') {
      courierStats[mappedCourier].with_tracking++;
    } else {
      courierStats[mappedCourier].without_tracking++;
      unassignedOrders.push({
        id: o.id,
        ref_number: o.ref_number,
        customer_name: o.customer_name,
        price: o.price,
        order_date: o.order_date,
        delivery_status: o.delivery_status,
        courier: o.courier,
        tracking_number: o.tracking_number
      });
    }

    if (!courierStats[mappedCourier].statuses[status]) {
      courierStats[mappedCourier].statuses[status] = 0;
    }
    courierStats[mappedCourier].statuses[status]++;
  }

  console.log('\n--- MAY 2026 AUDIT STATISTICS BY MAPPED COURIER ---');
  console.log(JSON.stringify(courierStats, null, 2));

  console.log(`\n--- UNASSIGNED / MISSING COURIER ORDERS (${unassignedOrders.length}) ---`);
  if (unassignedOrders.length > 0) {
    console.table(unassignedOrders.slice(0, 50));
  }
}

main().catch(err => {
  console.error('Fatal audit error:', err);
});
