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

  console.log(`🔐 Authenticated. Fetching TR32349 details from production API...`);
  
  // Query /api/orders with search=TR32349
  const res = await fetch(`${API_BASE}/api/orders?store_id=12&search=TR32349`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log("Response payload structure:", Object.keys(data));
    const orders = data.orders || data || [];
    console.log(`Found ${orders.length} orders matching search.`);
    if (orders.length > 0) {
      const order = orders[0];
      console.log("TR32349 details in production database:");
      console.log(JSON.stringify({
        id: order.id,
        ref_number: order.ref_number,
        product_titles: order.product_titles,
        items_count: order.items_count,
        price: order.price,
        delivery_status: order.delivery_status,
        payment_status: order.payment_status,
        line_items: order.line_items // Let's see if this has items!
      }, null, 2));
    }
  } else {
    console.error(`❌ Failed to fetch orders list: ${res.status}`);
  }
}

main().catch(err => console.error(err));
