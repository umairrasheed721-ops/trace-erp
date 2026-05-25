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
    const logsRes = await fetch('https://trace-erp-production.up.railway.app/api/admin/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const logsText = await logsRes.text();
    const lines = logsText.split('\n');
    console.log('🔍 Filtering logs for "FINAL PAYLOAD", "TELEMETRY", or "error":');
    lines.forEach(line => {
      if (line.includes('FINAL PAYLOAD') || line.includes('TELEMETRY') || line.includes('error') || line.includes('Sent to') || line.includes('Transcoding')) {
        console.log(line);
      }
    });
  } catch (e) {
    console.error('Error fetching logs:', e.message);
  }
}

main();
