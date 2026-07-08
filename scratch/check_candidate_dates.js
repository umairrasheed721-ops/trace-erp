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

  const storeId = 12;
  console.log(`🔐 Authenticated. Querying candidate orders in Booked, In Transit, Out for Delivery...`);

  // Let's query /api/orders with store_id=12 and limit=250 and status as needed.
  // We can fetch a list of orders and filter them locally.
  const res = await fetch(`${API_BASE}/api/orders?store_id=${storeId}&limit=250&page=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    const orders = data.orders || [];
    console.log(`Retrieved ${orders.length} orders from API.`);
    
    // Filter locally to find Booked, In Transit, Out for Delivery orders
    const candidates = orders.filter(o => {
      const st = (o.delivery_status || '').toLowerCase();
      return st === 'booked' || st === 'in transit' || st === 'out for delivery';
    });

    console.log(`Found ${candidates.length} candidate orders in this page.`);
    console.log("Candidate details:");
    candidates.forEach(o => {
      const dateVal = o.status_date || o.order_date || '';
      console.log({
        id: o.id,
        ref_number: o.ref_number,
        delivery_status: o.delivery_status,
        tracking_number: o.tracking_number,
        status_date: o.status_date,
        order_date: o.order_date,
        date_used: dateVal,
        hours_diff: dateVal ? (Date.now() - new Date(dateVal.replace(' ', 'T') + '+05:00').getTime()) / 3600000 : 'N/A'
      });
    });
  }
}

main().catch(err => console.error(err));
