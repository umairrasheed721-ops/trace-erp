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
    console.error('❌ Could not authenticate.');
    return;
  }

  const storeId = 12;
  console.log(`\n⏳ [Sync] Triggering sync-postex for Store ID: ${storeId}`);
  try {
    const peRes = await fetch(`${API_BASE}/api/tracking/sync-postex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ store_id: storeId, sync_type: 'FULL' })
    });
    console.log(`  PostEx sync response for Store ${storeId}:`, peRes.status, await peRes.json());
  } catch (e) {
    console.error(`  PostEx sync error for Store ${storeId}:`, e.message);
  }

  console.log(`\n⏳ [Sync] Triggering sync-instaworld for Store ID: ${storeId}`);
  try {
    const iwRes = await fetch(`${API_BASE}/api/tracking/sync-instaworld`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ store_id: storeId, sync_type: 'FULL' })
    });
    console.log(`  Instaworld sync response for Store ${storeId}:`, iwRes.status, await iwRes.json());
  } catch (e) {
    console.error(`  Instaworld sync error for Store ${storeId}:`, e.message);
  }
}

main().catch(err => {
  console.error(err);
});
