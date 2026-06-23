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

  // Let's find which store has data in May 2026
  const storeIds = [1, 2, 3, 4, 12, 13];
  let activeStoreId = null;
  let activeStoreOrders = [];

  for (const storeId of storeIds) {
    const url = `${API_BASE}/api/orders?store_id=${storeId}&start_date=2026-05-01&end_date=2026-05-31&limit=500`;
    console.log(`Checking Store ${storeId} at ${url}...`);
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`Store ${storeId}: ${data.total || 0} total orders in May 2026.`);
      if (data.orders && data.orders.length > 0) {
        activeStoreId = storeId;
        activeStoreOrders = data.orders;
        // Let's break if we found a store with plenty of orders
        if (data.total > 5) break;
      }
    } else {
      console.log(`Store ${storeId} check failed:`, res.status, await res.text());
    }
  }

  if (!activeStoreId) {
    console.log('❌ Could not find any store with orders in May 2026.');
    return;
  }

  console.log(`\n🎉 Found active store: Store ID ${activeStoreId} with ${activeStoreOrders.length} orders in May 2026.`);
  
  // Let's audit all orders for this store in May 2026
  // Fetch ALL orders in that range by fetching page 1, 2, etc. until we get all
  let allMayOrders = [];
  let page = 1;
  while (true) {
    const url = `${API_BASE}/api/orders?store_id=${activeStoreId}&start_date=2026-05-01&end_date=2026-05-31&limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      console.error(`Failed to fetch page ${page}:`, res.statusText);
      break;
    }
    const data = await res.json();
    if (!data.orders || data.orders.length === 0) break;
    allMayOrders = allMayOrders.concat(data.orders);
    if (allMayOrders.length >= data.total) break;
    page++;
  }

  console.log(`Fetched a total of ${allMayOrders.length} orders for Store ${activeStoreId} in May 2026.`);

  // Let's perform the audit of couriers
  const courierStats = {};
  const unassignedOrders = [];

  for (const o of allMayOrders) {
    const rawCourier = o.courier;
    const tracking = o.tracking_number;
    const status = o.delivery_status;

    // Use backend reports.js mapping logic
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
      if (tracking && tracking.trim() !== '' && tracking.trim() !== '—') {
        mappedCourier = 'PostEx'; // default fallback
      } else {
        // No courier, no tracking -> check if it's Self Delivery
        mappedCourier = 'Unassigned';
      }
    }

    // Check if it should have been mapped to Self Delivery
    if (mappedCourier === 'Unassigned' || mappedCourier === 'Unknown') {
      const trackingClean = (tracking || '').trim().toLowerCase();
      const selfKeywords = ['hand', 'self', 'rider', 'local', 'office', 'pickup', 'personal'];
      const datePattern = /^(?:\d{1,4})[./-]\d{1,2}[./-](?:\d{1,4})$/;
      if (selfKeywords.some(kw => trackingClean.includes(kw)) || datePattern.test(trackingClean)) {
        mappedCourier = 'Self Delivery';
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
