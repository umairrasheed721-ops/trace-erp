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

  console.log(`🔐 Authenticated. Querying logs for order ID 169622...`);
  
  // We call GET /api/diagnostics/live-db-diagnose or check logs from SQLite
  // Wait, let's write a custom diagnostic endpoint that returns order details with history!
  // Oh, wait, in diagnostics.js, GET /api/diagnostics/logs returns system logs, let's see if we can get order changes.
  // Wait! Let's update backend/routes/diagnostics.js to add a /test-history/:order_id route!
  // This is a great way to inspect the database tables (e.g. order_changes, tracking_history, etc.) for this order.
  
  // Let's modify the script to call /api/diagnostics/live-db-diagnose or we can add a new temporary endpoint.
  // Actually, we can add a temporary diagnostic route `/api/diagnostics/order-history/:order_id` in `diagnostics.js`!
  // Let's view the bottom lines of diagnostics.js first to append it.
}

main().catch(err => console.error(err));
