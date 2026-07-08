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
    console.error('❌ Could not authenticate.');
    return;
  }

  const storeId = 12;
  console.log(`🔐 Authenticated. Querying all delivery_status values in database...`);

  // We can fetch a list of orders or use the diagnostics if there's any other route.
  // Wait! Let's query /api/orders with different pages or check if we can query /api/diagnostics/live-db-diagnose
  // But wait, live-db-diagnose doesn't return delivery_status counts, it only returns table counts.
  // How can we run a query to get status counts?
  // We can add a temporary diagnostics route or check the audit logs!
  // Wait, let's see if we can check the order count by status by querying the orders list endpoint with search/status filters!
  // Let's do a loop over common status names to see their counts.
  const commonStatuses = [
    'Booked', 'In Transit', 'Shipper Advice', 'Returned', 'Delivered', 'Pending', 'Cancelled', 'Confirmed',
    'Picked Up', 'Unassigned', 'Shipped', 'Out for Delivery', 'Return Received', 'Refused', 'Void', 'Voided', 'Self Delivery', 'Ready to Book'
  ];

  for (const status of commonStatuses) {
    const res = await fetch(`${API_BASE}/api/orders?store_id=${storeId}&status=${encodeURIComponent(status)}&limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.total > 0) {
        console.log(`Status "${status}": ${data.total}`);
      }
    }
  }
}

main().catch(err => console.error(err));
