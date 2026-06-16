const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
const apiKey = 'juehwqkpycnowff4spoh'; // Known working Instaworld backup key from Store 12

const targetTrackingIds = [
  '173013574037',
  '173013401691',
  'LE7526802522',
  'LE7500750347',
  'LE793692118',
  'LE791264601'
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

  console.log(`🔐 Logged in to production.`);

  for (const tn of targetTrackingIds) {
    console.log(`\n------------------------------------------------`);
    console.log(`📡 Inspecting Tracking ID: ${tn}`);
    console.log(`------------------------------------------------`);

    // A. Query local ERP DB info via search API
    try {
      const searchRes = await fetch(`${API_BASE}/api/orders?store_id=12&search=${tn}&limit=2`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const sData = await searchRes.json();
        if (sData.orders && sData.orders.length > 0) {
          const order = sData.orders[0];
          console.log(`ERP Info: ID: ${order.id} | Ref: ${order.ref_number} | Customer: ${order.customer_name} | Courier: ${order.courier} | Courier Status: "${order.courier_status}" | ERP Status: "${order.delivery_status}"`);
        } else {
          console.log('ERP Info: No order found in ERP matching this tracking number.');
        }
      }
    } catch (err) {
      console.error('ERP Search Error:', err.message);
    }

    // B. Call Instaworld API to fetch latest courier status
    try {
      const res = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: tn, api_key: apiKey }),
        timeout: 15000
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[data.length - 1];
          console.log(`Courier API Latest: Date: ${latest.date_time} | Status: "${latest.status}"`);
          console.log('Courier API History Statuses:', data.map(item => `[${item.date_time}] ${item.status}`).join(' -> '));
        } else if (data?.status) {
          console.log(`Courier API Latest: Status: "${data.status}"`);
        } else {
          console.log(`Courier API Response (No Array):`, data);
        }
      } else {
        console.error(`Courier API HTTP Error ${res.status}:`, await res.text());
      }
    } catch (e) {
      console.error('Courier API Error:', e.message);
    }
  }
}

main().catch(err => console.error(err));
