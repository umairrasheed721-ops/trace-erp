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
    // We can write a temporary endpoint or we can read the file by modifying trigger_prod_sync_final.js
    // Wait, is there a system route to check code or run system diagnostics?
    // Let's check backend/routes/system.js using view_file or grep search.
  } catch (e) {
    console.error('Error:', e);
  }
}

main();
