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

  console.log('✅ Authenticated successfully!');

  // Search for the customer history for phone '03004008889'
  console.log('📡 Fetching customer history-search for phone 03004008889...');
  const historyRes = await fetch(`${API_BASE}/api/orders/history-search?phone=03004008889`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (historyRes.ok) {
    const historyData = await historyRes.json();
    console.log('History Search Orders:', JSON.stringify(historyData.orders, null, 2));
  } else {
    console.error('Failed history search:', historyRes.status);
  }

  // Let's do normal orders search for the store_id = 1 and search = '03004008889'
  console.log('\n📡 Fetching orders endpoint for store_id=1 and search=03004008889...');
  const ordersRes = await fetch(`${API_BASE}/api/orders?store_id=1&search=03004008889&limit=50&status=All%20Statuses`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (ordersRes.ok) {
    const ordersData = await ordersRes.json();
    console.log('Orders Search Result Count:', ordersData.orders ? ordersData.orders.length : 0);
    if (ordersData.orders) {
      console.log('Orders found:', JSON.stringify(ordersData.orders, null, 2));
    }
  } else {
    console.error('Failed orders search:', ordersRes.status);
  }
}

main();
