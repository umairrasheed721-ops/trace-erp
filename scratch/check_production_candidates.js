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

  console.log(`🔐 Authenticated.`);

  // Let's call /api/orders to get recent postex orders with advice/attempt statuses
  const url = `${API_BASE}/api/orders?store_id=12&limit=50&courier=PostEx&delivery_status=Attempted`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Fetch Status:", res.status);
  const data = await res.json();
  const orders = data.orders || [];
  console.log(`Found ${orders.length} Attempted PostEx orders in production:`);
  console.table(orders.map(o => ({
    id: o.id,
    tracking: o.tracking_number,
    ref: o.ref_number,
    status: o.delivery_status,
    status_date: o.status_date
  })));
}

main().catch(err => console.error(err));
