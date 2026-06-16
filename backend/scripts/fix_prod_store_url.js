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

  // 1. Fetch current store settings
  console.log(`📡 Fetching store info for Store ${storeId}...`);
  const storeRes = await fetch(`${API_BASE}/api/stores/${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!storeRes.ok) {
    console.error(`❌ Store ${storeId} not found.`);
    return;
  }
  const store = await storeRes.json();
  console.log('Current store info:', store);

  // 2. Update store config in production with the correct track URL
  console.log(`\n✏️ Updating instaworld_track_url to 'https://one-be.instaworld.pk/logistics/v1/trackShipment'...`);
  const updateRes = await fetch(`${API_BASE}/api/stores/${storeId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      ...store,
      instaworld_track_url: 'https://one-be.instaworld.pk/logistics/v1/trackShipment'
    })
  });
  console.log('Update status:', updateRes.status, await updateRes.json());

  // 3. Trigger sync-instaworld for Store 12 in production
  console.log(`\n⏳ [Sync] Triggering sync-instaworld for Store ID: ${storeId}...`);
  try {
    const iwRes = await fetch(`${API_BASE}/api/tracking/sync-instaworld`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ store_id: storeId, sync_type: 'FULL' })
    });
    console.log(`  Instaworld sync response:`, iwRes.status, await iwRes.json());
  } catch (e) {
    console.error(`  Instaworld sync error:`, e.message);
  }

  // 4. Query the order to verify status changed
  console.log(`\n📡 Verifying order 173013897464...`);
  const searchUrl = `${API_BASE}/api/orders?store_id=${storeId}&search=173013897464`;
  const sRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (sRes.ok) {
    const data = await sRes.json();
    console.log('Results:', JSON.stringify(data.orders, null, 2));
  }
}

main().catch(err => console.error(err));
