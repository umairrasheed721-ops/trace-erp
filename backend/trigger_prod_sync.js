const fetch = require('node-fetch');

async function main() {
  const adminPasswords = ['admin123', '03210321'];
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
    console.log('📡 Fetching connected stores...');
    const storesRes = await fetch('https://trace-erp-production.up.railway.app/api/stores', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const stores = await storesRes.json();
    console.log(`Stores found: ${stores.length}`);
    console.log(JSON.stringify(stores.map(s => ({ id: s.id, shop_domain: s.shop_domain, store_name: s.store_name })), null, 2));

    for (const store of stores) {
      if (!store.is_connected) {
        console.log(`⚠️ Skipping disconnected store: ${store.shop_domain}`);
        continue;
      }
      console.log(`🔄 Triggering courier tracking sync for store ID ${store.id} (${store.shop_domain})...`);
      
      const syncRes = await fetch('https://trace-erp-production.up.railway.app/api/tracking/sync-couriers', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ store_id: store.id })
      });

      console.log(`Status code: ${syncRes.status}`);
      const syncResult = await syncRes.json();
      console.log('Sync result:', JSON.stringify(syncResult, null, 2));
    }
  } catch (e) {
    console.error('Error during production sync execution:', e);
  }
}

main();
