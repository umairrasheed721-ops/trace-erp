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

  console.log(`🔐 Authenticated. Fetching live database diagnostics to find recent Instaworld orders...`);
  
  // Get stores to find store ID
  const storesRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stores = await storesRes.json();
  const storeId = stores[0]?.id || 12;

  // Query database diagnostics
  const diagRes = await fetch(`${API_BASE}/api/diagnostics/live-db-diagnose?store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!diagRes.ok) {
    console.error(`❌ Failed to get database diagnostics: ${diagRes.status}`);
    return;
  }

  // We need to fetch actual orders since live-db-diagnose returns max 250 rows in the response,
  // let's see if we can find one with courier = 'Instaworld'.
  // If not, we can query raw direct endpoint using a known track ID or search in the response.
  // Wait, let's call GET /api/orders/list or fetch diagnostics stats.
  // Wait, in trace-erp there is GET /api/orders endpoint. Let's fetch /api/orders?limit=100.
  const ordersRes = await fetch(`${API_BASE}/api/orders?limit=100&store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  let trackingNumber = null;

  if (ordersRes.ok) {
    const data = await ordersRes.json();
    const orders = data.orders || data || [];
    console.log(`Retrieved ${orders.length} orders from orders API.`);
    
    // Find Instaworld order
    const instaworldOrders = orders.filter(o => 
      o.courier && 
      (o.courier.toLowerCase().includes('insta') || o.courier.toLowerCase().includes('world')) &&
      o.tracking_number
    );

    console.log(`Found ${instaworldOrders.length} Instaworld orders in the latest batch.`);
    if (instaworldOrders.length > 0) {
      console.log("Recent Instaworld orders sample:");
      instaworldOrders.slice(0, 5).forEach(o => {
        console.log(`- Order: ${o.ref_number || o.id}, Tracking: ${o.tracking_number}, Status: ${o.delivery_status}`);
      });
      trackingNumber = instaworldOrders[0].tracking_number;
    } else {
      // Look at all orders with tracking numbers as fallback
      const hasTracking = orders.filter(o => o.tracking_number && o.tracking_number.length > 5);
      if (hasTracking.length > 0) {
        console.log(`No explicit Instaworld orders found. Fallback to first order with tracking: ${hasTracking[0].tracking_number} (Courier: ${hasTracking[0].courier})`);
        trackingNumber = hasTracking[0].tracking_number;
      }
    }
  }

  if (!trackingNumber) {
    // If no order is found in the latest 100, let's use a hardcoded recent Instaworld tracking number or probe the route directly
    // Let's ask db or use a fallback
    console.log("No recent tracking numbers found via API. Using default fallback/placeholder to probe.");
    trackingNumber = "123456789"; // placeholder
  }

  console.log(`\n📡 Running direct connection test to Instaworld (Bypassing proxy) for tracking: ${trackingNumber}...`);
  const rawTestRes = await fetch(`${API_BASE}/api/diagnostics/test-raw/${trackingNumber}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log(`Raw Direct Test status: ${rawTestRes.status}`);
  const result = await rawTestRes.json();
  console.log("Test Results:", JSON.stringify(result, null, 2));
}

main().catch(err => console.error(err));
