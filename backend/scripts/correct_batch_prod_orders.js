const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

const updates = [
  { id: 169724, status: 'Returned' },
  { id: 170003, status: 'Returned' }
];

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

  for (const item of updates) {
    console.log(`\n✏️ Updating order ${item.id} delivery_status to '${item.status}' in production...`);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          delivery_status: item.status
        })
      });

      console.log(`  Response status for ${item.id}:`, res.status);
      const data = await res.json();
      console.log(`  Response:`, data.success ? 'Success' : data);
    } catch (err) {
      console.error(`  Error updating ${item.id}:`, err.message);
    }
  }
}

main().catch(err => console.error(err));
