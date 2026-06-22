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

  console.log(`🔐 Authenticated. Fetching database statistics / diagnostics...`);
  
  // Let's call GET /api/diagnostics/live-db-diagnose
  const diagRes = await fetch(`${API_BASE}/api/diagnostics/live-db-diagnose`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const diagData = await diagRes.json();
  const storeId = diagData.stores[0]?.id || 12;

  // Let's call /api/orders with a high limit to scan for any Instaworld orders
  console.log(`Scanning last 1000 orders to find an Instaworld courier tracking number...`);
  const ordersRes = await fetch(`${API_BASE}/api/orders?limit=1000&store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!ordersRes.ok) {
    console.error("Failed to fetch orders.");
    return;
  }

  const data = await ordersRes.json();
  const orders = data.orders || data || [];
  
  const distinctCouriers = [...new Set(orders.map(o => o.courier).filter(Boolean))];
  console.log("Distinct couriers found in last 1000 orders:", distinctCouriers);

  const instaworldOrder = orders.find(o => 
    o.courier && 
    (o.courier.toLowerCase().includes('insta') || o.courier.toLowerCase().includes('world')) && 
    o.tracking_number
  );

  if (instaworldOrder) {
    console.log(`🎉 Found a real Instaworld tracking number!`);
    console.log(`Order Ref: ${instaworldOrder.ref_number}, Tracking: ${instaworldOrder.tracking_number}, Status: ${instaworldOrder.delivery_status}`);
    
    // Run direct test
    console.log(`\n🔌 Running direct test for Instaworld order...`);
    const testRes = await fetch(`${API_BASE}/api/diagnostics/test-raw/${instaworldOrder.tracking_number}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await testRes.json();
    console.log("Response:", JSON.stringify(result, null, 2));
  } else {
    console.log("No Instaworld orders found in the last 1000 orders.");
  }
}

main().catch(err => console.error(err));
