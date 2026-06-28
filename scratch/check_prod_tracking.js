const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const tracking = '22246260003305';

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

  console.log('✅ Authenticated successfully.');

  // Step 1: Fetch all stores
  const storesRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stores = await storesRes.json();
  console.log(`📋 Found ${stores.length} stores in production.`);

  // Step 2: Search for tracking ID in each store
  for (const store of stores) {
    console.log(`🔍 Searching store ${store.id} (${store.name})...`);
    const searchRes = await fetch(`${API_BASE}/api/orders?store_id=${store.id}&search=${tracking}&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      const orders = data.orders || data.data || [];
      if (orders.length > 0) {
        console.log(`🎉 Found match in store ${store.id} (${store.name})!`);
        orders.forEach(o => {
          console.log('Order Details:', {
            id: o.id,
            ref_number: o.ref_number,
            shopify_order_id: o.shopify_order_id,
            delivery_status: o.delivery_status,
            price: o.price,
            customer_name: o.customer_name,
            tracking_number: o.tracking_number
          });
        });
      }
    } else {
      console.error(`Failed to query store ${store.id}: ${searchRes.status}`);
    }
  }
}

main().catch(err => console.error(err));
