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
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  console.log(`🔐 Logged in successfully to production API.`);

  // Let's call /api/reports/daily to see what it returns
  console.log('📡 Fetching daily report to inspect store/date info...');
  const reportRes = await fetch(`${API_BASE}/api/reports/daily?t=${Date.now()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (reportRes.ok) {
    const data = await reportRes.json();
    console.log('Daily report response status:', reportRes.status);
    console.log('Daily report keys:', Object.keys(data));
    if (data.dailyData) {
      console.log(`Found ${data.dailyData.length} daily data rows.`);
      if (data.dailyData.length > 0) {
        console.log('Sample row:', data.dailyData[0]);
      }
    }
  } else {
    console.error('Daily report failed:', reportRes.statusText, await reportRes.text());
  }

  // Let's try to find stores
  const storesRes = await fetch(`${API_BASE}/api/reports/courier-comparison?store_id=1&startDate=2026-05-01&endDate=2026-05-31`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Courier comparison response:', storesRes.status);
  if (storesRes.ok) {
    const cc = await storesRes.json();
    console.log('Courier comparison sample keys:', Object.keys(cc));
  } else {
    console.log('Courier comparison error text:', await storesRes.text());
  }
}

main().catch(err => {
  console.error('Error:', err);
});
