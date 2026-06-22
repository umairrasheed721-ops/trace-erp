const fetch = require('node-fetch'); // local script can use node-fetch

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

  console.log(`🔐 Authenticated. Fetching stores list...`);
  const storesRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!storesRes.ok) {
    console.error(`❌ Failed to get stores: ${storesRes.status}`);
    return;
  }

  const stores = await storesRes.json();
  console.log(`Found ${stores.length} stores:`);
  for (const store of stores) {
    console.log(`- Store ID: ${store.id}, Domain: ${store.shop_domain}`);
  }

  for (const store of stores) {
    console.log(`\n🚀 Triggering Shopify Sync for Store ${store.id} (${store.shop_domain})...`);
    
    // We call POST /api/tracking/sync-shopify
    const syncRes = await fetch(`${API_BASE}/api/tracking/sync-shopify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ store_id: store.id, forceDeepSync: false })
    });

    console.log(`Response Status: ${syncRes.status}`);
    const syncResult = await syncRes.json();
    console.log(`Response Body:`, syncResult);
  }

  console.log('\n⏳ Waiting 15 seconds for background sync to run...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Let's check status of sync journal or stores sync status
  console.log('\n📡 Checking updated stores status...');
  const updatedStoresRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (updatedStoresRes.ok) {
    const updatedStores = await updatedStoresRes.json();
    for (const s of updatedStores) {
      console.log(`Store ID ${s.id} (${s.shop_domain}):`);
      console.log(`  Sync Status: ${s.sync_status}`);
      console.log(`  Sync Progress: ${s.sync_progress}`);
      console.log(`  Processed: ${s.sync_processed} / ${s.sync_total}`);
      console.log(`  Last Synced At: ${s.last_synced_at}`);
    }
  }

  // Let's check sync history or recent system logs
  console.log('\n📡 Fetching recent system logs to confirm success/failure...');
  const logsRes = await fetch(`${API_BASE}/api/diagnostics/logs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (logsRes.ok) {
    const logs = await logsRes.json();
    console.log("Recent 15 logs:");
    console.table(logs.slice(0, 15).map(l => ({
      time: l.created_at,
      module: l.module,
      msg: l.message,
      lvl: l.level
    })));
  }
}

main().catch(err => console.error(err));
