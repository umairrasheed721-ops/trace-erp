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
  console.log(`🔐 Authenticated. Fetching orders with status=[WATCHDOG FRAUD] from production...`);
  
  const res = await fetch(`${API_BASE}/api/orders?store_id=${storeId}&status=${encodeURIComponent('[WATCHDOG FRAUD]')}&limit=50&page=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Successfully retrieved ${data.orders?.length || 0} orders (Total count: ${data.total || 0})`);
    if (data.orders?.length > 0) {
      console.log("Filtered orders:");
      console.log(data.orders.map(o => ({
        id: o.id,
        ref_number: o.ref_number,
        customer_name: o.customer_name,
        tracking_number: o.tracking_number,
        delivery_status: o.delivery_status
      })));
    }
  } else {
    console.error(`❌ Failed: ${res.status}`);
  }
}

main().catch(err => console.error(err));
