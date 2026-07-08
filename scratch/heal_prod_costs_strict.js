const fetch = require('node-fetch');
const API_BASE = 'https://trace-erp-production.up.railway.app';

async function main() {
  const loginRes = await fetch(API_BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const { token } = await loginRes.json();
  if (!token) {
    console.error('Failed to log in');
    return;
  }
  console.log('Logged in successfully');

  // Trigger healing by updating a master cost dummy, which internally triggers healCostsForStore
  const res = await fetch(API_BASE + '/api/finance/master-costs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      store_id: 12,
      parent_title: 'BIG size POLO pk',
      variant_title: '',
      unit_cost: 900,
      packaging_cost: 0
    })
  });

  console.log('Update response status:', res.status);
  const data = await res.json();
  console.log('Response:', data);

  // Let's check TR31273 again to see if its cost was updated to 0
  const searchRes = await fetch(API_BASE + '/api/orders?store_id=12&search=TR31273', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const searchData = await searchRes.json();
  if (searchData.orders && searchData.orders.length > 0) {
    const order = searchData.orders[0];
    console.log(`Order: ${order.ref_number}, Cost: ${order.cost}, Delivery Status: ${order.delivery_status}`);
  }
}

main().catch(console.error);
