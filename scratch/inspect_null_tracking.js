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

  const storeId = 12; 
  const startDate = '2026-05-01';
  const endDate = '2026-05-31';

  let allOrders = [];
  let page = 1;
  while (true) {
    const ordersUrl = `${API_BASE}/api/orders?store_id=${storeId}&start_date=${startDate}&end_date=${endDate}&limit=250&page=${page}`;
    const res = await fetch(ordersUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) break;
    const d = await res.json();
    if (!d.orders || d.orders.length === 0) break;
    allOrders = allOrders.concat(d.orders);
    if (allOrders.length >= d.total) break;
    page++;
  }

  const nullCourierOrders = allOrders.filter(o => (!o.courier || o.courier.trim() === '') && o.tracking_number && o.tracking_number.trim() !== '' && o.tracking_number.trim() !== '—');
  console.log(`Found ${nullCourierOrders.length} orders with tracking but no courier:`);
  
  const mapped = nullCourierOrders.map(o => ({
    id: o.id,
    ref_number: o.ref_number,
    customer_name: o.customer_name,
    tracking_number: o.tracking_number,
    delivery_status: o.delivery_status,
    order_date: o.order_date
  }));
  console.table(mapped);
}

main().catch(err => console.error(err));
