const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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
    const logsRes = await fetch('https://trace-erp-production.up.railway.app/api/admin/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const logsText = await logsRes.text();
    fs.writeFileSync(path.join(__dirname, 'full_logs.txt'), logsText);
    console.log('✅ Wrote all logs to scratch/full_logs.txt');
  } catch (e) {
    console.error('Error fetching logs:', e.message);
  }
}

main();
