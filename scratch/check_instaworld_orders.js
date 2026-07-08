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

  console.log(`🔐 Authenticated. Querying Instaworld/Leopards/TCS orders with tracking history...`);
  // Let's call /api/orders with a search or filter, or we can fetch a few pages to see!
  // Wait! Let's query orders from store_id=12
  const res = await fetch(`${API_BASE}/api/orders?store_id=12&limit=250&page=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    const orders = data.orders || [];
    console.log(`Found ${orders.length} total orders in current page.`);
    const nonPostex = orders.filter(o => {
      const c = (o.courier || '').toLowerCase();
      return c.includes('insta') || c.includes('leopard') || c.includes('tcs') || c.includes('lcs');
    });
    console.log(`Found ${nonPostex.length} non-PostEx (Instaworld/Leopards/TCS) orders.`);
    if (nonPostex.length > 0) {
      console.log("Sample non-PostEx orders details:");
      console.log(nonPostex.slice(0, 5).map(o => ({
        id: o.id,
        ref_number: o.ref_number,
        courier: o.courier,
        tracking_number: o.tracking_number,
        delivery_status: o.delivery_status,
        has_history: !!o.tracking_history,
        history_length: o.tracking_history ? o.tracking_history.length : 0
      })));
    }
  }
}

main().catch(err => console.error(err));
