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

  const orderId = 200839; // ID of TR32349 in production
  console.log(`🔐 Authenticated. Triggering force resync for order ID ${orderId}...`);
  
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/resync`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log("Resync HTTP status:", res.status);
  const result = await res.json();
  console.log("Resync result:", JSON.stringify(result, null, 2));

  // Now fetch the updated order fields to see if the database is updated!
  console.log("Fetching updated order fields from /api/orders...");
  const searchRes = await fetch(`${API_BASE}/api/orders?store_id=12&search=TR32349`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const orders = searchData.orders || searchData || [];
    if (orders.length > 0) {
      const o = orders[0];
      console.log("Updated TR32349 details in production database:");
      console.log(JSON.stringify({
        id: o.id,
        ref_number: o.ref_number,
        product_titles: o.product_titles,
        items_count: o.items_count,
        price: o.price,
        delivery_status: o.delivery_status,
        payment_status: o.payment_status,
        line_items: o.line_items
      }, null, 2));
    }
  }
}

main().catch(err => console.error(err));
