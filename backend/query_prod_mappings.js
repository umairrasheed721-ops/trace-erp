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
    // There is a route for status mappings: GET /api/status-mappings
    const url = 'https://trace-erp-production.up.railway.app/api/status-mappings';
    console.log(`📡 Fetching status mappings from: ${url}`);
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const mappings = await res.json();
    console.log('Production Status Mappings:', JSON.stringify(mappings, null, 2));
  } catch (e) {
    console.error('Error fetching mappings:', e);
  }
}

main();
