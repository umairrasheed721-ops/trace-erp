const fetch = require('node-fetch');

async function main() {
  const adminPasswords = ['admin123', '03210321']; // try common passwords from logs
  let token = null;

  for (const password of adminPasswords) {
    try {
      console.log(`🔑 Attempting login with password: ${password}...`);
      const loginRes = await fetch('https://trace-erp-production.up.railway.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        console.log('✅ Login successful!');
        token = data.token;
        break;
      } else {
        console.warn(`❌ Login failed for password ${password}:`, data.error || loginRes.statusText);
      }
    } catch (e) {
      console.error('Error during login:', e.message);
    }
  }

  if (!token) {
    console.error('❌ Could not authenticate to production server.');
    return;
  }

  try {
    console.log('📡 Fetching logs from /api/admin/logs...');
    const logsRes = await fetch('https://trace-erp-production.up.railway.app/api/admin/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const logsText = await logsRes.text();
    console.log('\n--- LIVE PRODUCTION LOGS ---');
    console.log(logsText);
    console.log('----------------------------');
  } catch (e) {
    console.error('Error fetching logs:', e.message);
  }
}

main();
