const path = require('path');
const fs = require('fs');
const tenantContext = require('../tenant-context');
const { db } = require('../db');
const { syncPostEx } = require('../engines/tracking/postex');
const { syncInstaworld } = require('../engines/tracking/instaworld');

function getAllTenants() {
  try {
    const dbDir = path.dirname(path.resolve(process.env.DB_PATH || './trace_erp.db'));
    const files = fs.readdirSync(dbDir);
    const tenants = ['default'];
    files.forEach(f => {
      if (f.startsWith('trace_erp_') && f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal') && f !== 'trace_erp_db.db') {
        const tenantId = f.replace('trace_erp_', '').replace('.db', '');
        if (tenantId && tenantId !== 'db') {
          tenants.push(tenantId);
        }
      }
    });
    return tenants;
  } catch (e) {
    return ['default'];
  }
}

async function main() {
  console.log('🚀 Starting forced tracking synchronization for all tenants...');
  const tenants = getAllTenants();
  console.log('Detected tenants:', tenants);

  for (const tenantId of tenants) {
    console.log(`\n==========================================`);
    console.log(`👥 Processing Tenant: [${tenantId}]`);
    console.log(`==========================================`);
    
    await tenantContext.run(tenantId, async () => {
      try {
        const stores = db.prepare("SELECT * FROM stores").all();
        console.log(`Found ${stores.length} stores for tenant [${tenantId}]`);
        
        for (const store of stores) {
          console.log(`\n🏬 Store: ${store.shop_domain} (ID: ${store.id})`);
          
          try {
            console.log(`⏳ [PostEx] Syncing orders...`);
            const postexRes = await syncPostEx(store, 'FULL');
            console.log(`✅ [PostEx] Sync complete. Result:`, postexRes);
          } catch (peErr) {
            console.error(`❌ [PostEx] Sync failed for store ${store.shop_domain}:`, peErr.message);
          }

          try {
            console.log(`⏳ [Instaworld] Syncing orders...`);
            const instaRes = await syncInstaworld(store, 'FULL');
            console.log(`✅ [Instaworld] Sync complete. Result:`, instaRes);
          } catch (iwErr) {
            console.error(`❌ [Instaworld] Sync failed for store ${store.shop_domain}:`, iwErr.message);
          }
        }
      } catch (dbErr) {
        console.error(`❌ Database error for tenant [${tenantId}]:`, dbErr.message);
      }
    });
  }

  console.log('\n🏁 Forced synchronization complete for all tenants.');
}

main().catch(err => {
  console.error('Fatal synchronization error:', err);
});
