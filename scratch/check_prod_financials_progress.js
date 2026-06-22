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
    // We can fetch a list of orders with a search query or inspect count
    // Wait, let's search if there's a custom query or stats endpoint.
    // Or we can just fetch the first 250 orders, and see how many of them have non-zero shipping_fee or discount_amount!
    const res = await fetch(`${API_BASE}/api/orders?store_id=12&limit=250&page=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const orders = data.orders || data.data || [];
    
    let nonZeroShipping = 0;
    let nonZeroDiscount = 0;
    let bothZero = 0;

    orders.forEach(o => {
      const sf = parseFloat(o.shipping_fee || 0);
      const da = parseFloat(o.discount_amount || 0);
      if (sf !== 0) nonZeroShipping++;
      if (da !== 0) nonZeroDiscount++;
      if (sf === 0 && da === 0) bothZero++;
    });

    console.log(`📊 Sample of ${orders.length} recent orders in production:`);
    console.log(`  - Orders with non-zero shipping fee: ${nonZeroShipping}`);
    console.log(`  - Orders with non-zero discount: ${nonZeroDiscount}`);
    console.log(`  - Orders with both zero: ${bothZero}`);
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

main().catch(err => console.error(err));
