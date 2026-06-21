const path = require('path');
const fs = require('fs');
const tenantContext = require('../tenant-context');
const { db } = require('../db');
const customFetch = require('../engines/fetch');

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

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🚀 Starting legacy financials update for all tenants...');
  const tenants = getAllTenants();
  console.log('Detected tenants:', tenants);

  const args = process.argv.slice(2);
  const filterMissingOnly = args.includes('--missing-only');
  console.log(`Update Mode: ${filterMissingOnly ? 'Only orders where shipping_fee = 0 and discount_amount = 0' : 'ALL orders with Shopify IDs'}`);

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
          if (!store.access_token || store.access_token === 'PENDING') {
            console.log(`⚠️ Shopify token not configured. Skipping.`);
            continue;
          }

          // Query matching orders
          let ordersQuery;
          if (filterMissingOnly) {
            ordersQuery = db.prepare(`
              SELECT shopify_order_id, id, ref_number, shipping_fee, discount_amount 
              FROM orders 
              WHERE store_id = ? 
              AND shopify_order_id IS NOT NULL 
              AND shopify_order_id != ''
              AND (shipping_fee = 0 AND discount_amount = 0)
            `);
          } else {
            ordersQuery = db.prepare(`
              SELECT shopify_order_id, id, ref_number, shipping_fee, discount_amount 
              FROM orders 
              WHERE store_id = ? 
              AND shopify_order_id IS NOT NULL 
              AND shopify_order_id != ''
            `);
          }

          const orders = ordersQuery.all(store.id);
          console.log(`📋 Found ${orders.length} orders matching criteria in the database.`);

          if (orders.length === 0) {
            console.log(`✅ No orders to update for store ${store.shop_domain}`);
            continue;
          }

          // Map local orders by shopify_order_id for quick lookup
          const localOrderMap = {};
          orders.forEach(o => {
            localOrderMap[String(o.shopify_order_id)] = o;
          });

          const shopifyOrderIds = orders.map(o => String(o.shopify_order_id));
          const batches = chunkArray(shopifyOrderIds, 50);

          console.log(`📦 Chunked orders into ${batches.length} batches of 50.`);

          let totalUpdated = 0;

          for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`⏳ [Batch ${i + 1}/${batches.length}] Fetching ${batch.length} orders from Shopify...`);

            try {
              const idsParam = batch.join(',');
              const url = `https://${store.shop_domain}/admin/api/2024-10/orders.json?ids=${idsParam}&status=any`;
              
              const res = await customFetch(url, {
                headers: { 'X-Shopify-Access-Token': store.access_token },
                timeout: 15000
              });

              if (!res.ok) {
                console.error(`❌ Shopify API error (HTTP ${res.status}) on batch ${i + 1}. Skipping.`);
                continue;
              }

              const data = await res.json();
              const shopifyOrders = data.orders || [];
              console.log(`✅ Received ${shopifyOrders.length} orders. Updating database...`);

              db.transaction(() => {
                for (const fresh of shopifyOrders) {
                  const shopifyShipping = fresh.shipping_lines?.[0]?.price ? parseFloat(fresh.shipping_lines[0].price) : 0;
                  const shopifyDiscount = parseFloat(fresh.current_total_discounts || fresh.total_discounts || 0);

                  const localOrder = localOrderMap[String(fresh.id)];
                  if (localOrder) {
                    db.prepare(`
                      UPDATE orders 
                      SET shipping_fee = ?, discount_amount = ? 
                      WHERE id = ?
                    `).run(shopifyShipping, shopifyDiscount, localOrder.id);
                    totalUpdated++;
                  }
                }
              })();

              // Check Shopify rate limits from headers
              const rateLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
              if (rateLimit) {
                const [used, total] = rateLimit.split('/').map(Number);
                console.log(`📊 API Call Limit: ${used}/${total}`);
                if (used >= total - 10) {
                  console.log(`⏳ Approaching API rate limit. Cooling down for 3 seconds...`);
                  await sleep(3000);
                } else {
                  await sleep(500); // Default 500ms safety sleep
                }
              } else {
                await sleep(500);
              }

            } catch (batchErr) {
              console.error(`❌ Error processing batch ${i + 1}:`, batchErr.message);
              await sleep(1000);
            }
          }

          console.log(`🏁 Finished store ${store.shop_domain}. Updated ${totalUpdated} orders.`);
        }
      } catch (dbErr) {
        console.error(`❌ Database error for tenant [${tenantId}]:`, dbErr.message);
      }
    });
  }

  console.log('\n🏁 Financials migration update script completed.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error during update:', err);
  process.exit(1);
});
