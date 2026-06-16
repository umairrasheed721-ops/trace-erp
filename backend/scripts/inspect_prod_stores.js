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

  // Decode JWT to see tenant_id
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  console.log('JWT Payload:', payload);

  // Let's search orders to find stores and their IDs in production
  // We can query GET /api/orders or similar search endpoint
  // Let's try GET /api/reports/daily
  console.log('📡 Fetching daily report to inspect store ID...');
  const repRes = await fetch(`${API_BASE}/api/reports/daily?t=${Date.now()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Daily reports status:', repRes.status);
  
  // Let's try to query orders to find what stores exist in production
  // Let's see: is there a search or orders route?
  // Let's try POST /api/orders/search or search query
  console.log('📡 Fetching orders to find store_id...');
  const searchRes = await fetch(`${API_BASE}/api/orders/search?limit=10&page=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ filters: {} })
  });
  console.log('Search status:', searchRes.status);
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    console.log('Orders found:', searchData.orders ? searchData.orders.length : 0);
    if (searchData.orders && searchData.orders.length > 0) {
      const order = searchData.orders[0];
      console.log('Sample Order fields:', Object.keys(order));
      const storeIds = [...new Set(searchData.orders.map(o => o.store_id))];
      console.log('Unique store IDs in search orders:', storeIds);
      
      const mismatch = searchData.orders.filter(o => o.courier_status === 'Return to Origin' || o.courier_status === 'return to origin');
      console.log('Mismatched orders in sample:', mismatch.map(o => ({ id: o.id, courier_status: o.courier_status, delivery_status: o.delivery_status })));
    }
  }
}

main().catch(err => {
  console.error(err);
});
