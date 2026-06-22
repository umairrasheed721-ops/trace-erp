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

  try {
    // We saw store_id 12 was used in sync requests
    const res = await fetch(`${API_BASE}/api/orders?store_id=12&limit=20&page=1`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      console.error(`HTTP Error ${res.status}: ${await res.text()}`);
      return;
    }

    const data = await res.json();
    const orders = data.orders || data.data || [];
    console.log(`📋 Found ${orders.length} orders in production.`);

    const samples = orders.slice(0, 5);
    samples.forEach(o => {
      console.log(`- Order: ${o.ref_number || o.id}`);
      console.log(`  Shopify ID: ${o.shopify_order_id}`);
      console.log(`  Price: ${o.price}`);
      console.log(`  Shipping Fee (Customer): ${o.shipping_fee}`);
      console.log(`  Discount Amount: ${o.discount_amount}`);
      console.log(`  Courier: ${o.courier}`);
    });
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

main().catch(err => console.error(err));
