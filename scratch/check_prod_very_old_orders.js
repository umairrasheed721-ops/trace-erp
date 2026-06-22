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
    // Page 126 has the oldest orders
    const res = await fetch(`${API_BASE}/api/orders?store_id=12&limit=250&page=126`, {
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

    console.log(`📊 Sample of ${orders.length} oldest orders (Page 126) in production:`);
    console.log(`  - Orders with non-zero shipping fee: ${nonZeroShipping}`);
    console.log(`  - Orders with non-zero discount: ${nonZeroDiscount}`);
    console.log(`  - Orders with both zero: ${bothZero}`);

    const updated = orders.filter(o => parseFloat(o.shipping_fee || 0) !== 0 || parseFloat(o.discount_amount || 0) !== 0).slice(0, 5);
    if (updated.length > 0) {
      console.log('\nUpdated Samples:');
      updated.forEach(o => {
        console.log(`- Order: ${o.ref_number || o.id}`);
        console.log(`  Shipping Fee: ${o.shipping_fee}`);
        console.log(`  Discount: ${o.discount_amount}`);
      });
    }
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

main().catch(err => console.error(err));
