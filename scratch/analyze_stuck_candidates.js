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
  console.log(`🔐 Authenticated. Running diagnostic queries on production...`);

  // We can write a custom script that we deploy, or we can use the existing check_prod_orders.js clone!
  // Wait, let's see if we can query /api/orders with different parameters, e.g. status!
  // Let's query /api/orders with status=Booked, status=In Transit, status=Shipper Advice
  const statuses = ['Booked', 'In Transit', 'Shipper Advice', 'Returned', 'Delivered', 'Pending'];
  for (const status of statuses) {
    const res = await fetch(`${API_BASE}/api/orders?store_id=${storeId}&status=${encodeURIComponent(status)}&limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`Status "${status}" count/total: ${data.total || 0}`);
    }
  }
}

main().catch(err => console.error(err));
