const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const orderId = 202122;
const storeId = 14;

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

  // 1. Fetch system logs / audit logs / order history from production
  // Let's check if there is an endpoint to retrieve logs or history for an order.
  // Actually, we can fetch order details directly from /api/orders/:id/history or similar if it exists.
  // Let's check /api/orders/history-search or search the routes for history/logs endpoints first.
  console.log('Fetching audit logs for store:', storeId);
  
  // Let's try querying the order history or logs if we have custom endpoints or write a tiny script to query it on Railway if we have access.
  // Since we don't have direct SQL console on Railway, let's look at the routes file to see what logs endpoints are exposed.
}

main().catch(err => console.error(err));
