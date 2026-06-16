const fetch = require('node-fetch');

async function main() {
  const adminPasswords = ['admin123', '03210321'];
  let token = null;

  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch('https://trace-erp-production.up.railway.app/api/auth/login', {
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

  try {
    // We can fetch orders filtering by status 'Booked' if possible, or fetch and count them
    // The api route has support for status filtering: status=Booked or status=booked
    const url = `https://trace-erp-production.up.railway.app/api/orders?store_id=12&limit=100&page=1&status=Booked`;
    console.log(`📡 Fetching Booked orders from: ${url}`);
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`Total Booked orders remaining on production: ${data.total}`);
    if (data.orders && data.orders.length > 0) {
      console.log('Booked orders details:', JSON.stringify(data.orders.map(o => ({
        id: o.id,
        ref_number: o.ref_number,
        tracking_number: o.tracking_number,
        courier: o.courier,
        courier_status: o.courier_status
      })), null, 2));
    }
  } catch (e) {
    console.error('Error checking Booked orders:', e);
  }
}

main();
