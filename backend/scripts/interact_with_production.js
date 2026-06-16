const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  let token = null;
  let loggedInPassword = null;

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
        loggedInPassword = password;
        break;
      }
    } catch (e) {}
  }

  if (!token) {
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  console.log(`🔐 Logged in successfully to production using admin password.`);

  // 1. Fetch current status mappings from production
  console.log('📡 Fetching status mappings...');
  const mappingsRes = await fetch(`${API_BASE}/api/status-mappings`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!mappingsRes.ok) {
    console.error(`❌ Failed to fetch mappings: ${mappingsRes.statusText}`);
    return;
  }

  const { mappings } = await mappingsRes.json();
  console.log(`Found ${mappings.length} status mappings in production.`);

  // Check if mappings for 'return to origin' are present
  const allMapping = mappings.find(m => m.courier.toLowerCase() === 'all' && m.courier_status.toLowerCase() === 'return to origin');
  const lcsMapping = mappings.find(m => m.courier.toLowerCase() === 'lcs' && m.courier_status.toLowerCase() === 'return to origin');

  console.log('Current "return to origin" mappings in production:');
  console.log('  all:', allMapping ? `${allMapping.erp_status} (active: ${allMapping.is_active})` : 'Missing');
  console.log('  LCS:', lcsMapping ? `${lcsMapping.erp_status} (active: ${lcsMapping.is_active})` : 'Missing');

  // Insert missing mappings in production
  if (!allMapping) {
    console.log('➕ Creating "all" mapping for "return to origin" -> "Returned"...');
    const res = await fetch(`${API_BASE}/api/status-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ courier: 'all', courier_status: 'return to origin', erp_status: 'Returned' })
    });
    console.log('  all mapping response:', res.status, await res.json());
  } else if (allMapping.erp_status !== 'Returned') {
    console.log(`✏️ Updating "all" mapping erp_status to "Returned" (currently: "${allMapping.erp_status}")...`);
    const res = await fetch(`${API_BASE}/api/status-mappings/${allMapping.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ courier: 'all', courier_status: 'return to origin', erp_status: 'Returned', is_active: 1 })
    });
    console.log('  all mapping update response:', res.status, await res.json());
  }

  if (!lcsMapping) {
    console.log('➕ Creating "LCS" mapping for "return to origin" -> "Returned"...');
    const res = await fetch(`${API_BASE}/api/status-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ courier: 'LCS', courier_status: 'return to origin', erp_status: 'Returned' })
    });
    console.log('  LCS mapping response:', res.status, await res.json());
  } else if (lcsMapping.erp_status !== 'Returned') {
    console.log(`✏️ Updating "LCS" mapping erp_status to "Returned" (currently: "${lcsMapping.erp_status}")...`);
    const res = await fetch(`${API_BASE}/api/status-mappings/${lcsMapping.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ courier: 'LCS', courier_status: 'return to origin', erp_status: 'Returned', is_active: 1 })
    });
    console.log('  LCS mapping update response:', res.status, await res.json());
  }

  // 2. Fetch stores to get store IDs
  console.log('\n📡 Fetching store information...');
  // We can fetch from public or get from an orders query, or just hit default store ID = 1.
  // Let's call a route like GET /api/orders to get recent orders and find store ids, or let's look for a store endpoint
  // Is there GET /api/stores? Let's check routes
  const storesRes = await fetch(`${API_BASE}/api/reports/daily?t=${Date.now()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Actually, we can trigger sync directly for store_id: 1 and other common ids.
  const storeIds = [1, 2, 3];
  for (const storeId of storeIds) {
    console.log(`\n⏳ [Sync] Triggering sync-postex and sync-instaworld for Store ID: ${storeId}`);
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
}

main().catch(err => {
  console.error('Fatal production interaction error:', err);
});
