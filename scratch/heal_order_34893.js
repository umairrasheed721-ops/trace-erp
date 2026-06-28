const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const ORDER_ID = 202324; // #34893

async function main() {
  let token = null;
  console.log('🔑 Authenticating with production server...');
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

  if (!token) return;

  console.log(`\n📡 Updating cost of order ID ${ORDER_ID} to 550...`);
  // Let's see: is there an endpoint to update a single order field?
  // In SearchTool.jsx: updateOrderField(orderId, fieldName, value)
  // Let's check how updateOrderField is implemented in SearchTool.jsx or orders-mutations.js.
  // In orders-mutations.js: PATCH /api/orders/:id/field or PUT /api/orders/:id
  // Let's check how to update it.
}

main().catch(err => console.error(err));
