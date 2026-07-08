const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      console.log(`Password: "${password}" | Status: ${loginRes.status} | Token: ${data.token ? "YES" : "NO"}`);
    } catch (e) {
      console.error(`Error for "${password}":`, e.message);
    }
  }
}

main();
