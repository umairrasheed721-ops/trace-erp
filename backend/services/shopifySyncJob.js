const { db } = require('../db');
const tenantContext = require('../tenant-context');
const fs = require('fs');
const path = require('path');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

// Helper to get all tenants (matching scheduler.js)
function getAllTenants() {
  const tenants = ['default'];
  try {
    const { DB_DIR } = require('../db');
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants in ShopifySyncJob:', e.message);
  }
  return tenants;
}

// Function to update order tags in Shopify (returns Promise)
async function addShopifyTag(tenantId, orderId, erpStatus) {
  try {
    // Look up shopify_order_id, shop_domain, access_token for this order
    const orderInfo = db.prepare(`
      SELECT o.shopify_order_id, s.shop_domain, s.access_token, s.id as store_id
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `).get(orderId);

    if (!orderInfo) {
      throw new Error(`No orderInfo found for order ID: ${orderId}`);
    }

    const { shopify_order_id: shopifyOrderId, shop_domain: shopDomain, access_token: accessToken } = orderInfo;
    if (!accessToken || accessToken === 'PENDING') {
      throw new Error(`Invalid/missing access token for store`);
    }

    // 1. Fetch current tags from Shopify
    const getUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
    const getRes = await fetch(getUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      },
      timeout: 15000
    });

    if (!getRes.ok) {
      throw new Error(`Failed to GET order from Shopify: ${getRes.status} ${getRes.statusText}`);
    }

    const getData = await getRes.json();
    const existingTagsStr = getData.order?.tags || '';
    const existingTags = existingTagsStr ? existingTagsStr.split(',').map(t => t.trim()) : [];

    // 2. Clean trace tags and add the new one
    const cleanedTags = existingTags.filter(t => !t.startsWith('Trace:'));
    cleanedTags.push(erpStatus);
    const updatedTagsStr = cleanedTags.join(', ');

    // 3. Push the new tags back to Shopify
    const putUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order: {
          id: shopifyOrderId,
          tags: updatedTagsStr
        }
      }),
      timeout: 15000
    });

    if (!putRes.ok) {
      throw new Error(`Failed to PUT order tags to Shopify: ${putRes.status} ${putRes.statusText}`);
    }

    return updatedTagsStr;
  } catch (err) {
    throw err;
  }
}

async function syncShopifyTagsInBatch(tenantId, pending) {
  try {
    // Join with orders and stores to get all credentials in one query
    const records = db.prepare(`
      SELECT p.id as poll_id, p.order_id, p.erp_status, o.shopify_order_id, s.shop_domain, s.access_token, s.id as store_id
      FROM whatsapp_polls p
      JOIN orders o ON p.order_id = o.id
      JOIN stores s ON o.store_id = s.id
      WHERE p.id IN (${pending.map(() => '?').join(',')})
    `).all(...pending.map(r => r.id));

    // Group records by store_id
    const groups = {};
    for (const r of records) {
      if (!r.access_token || r.access_token === 'PENDING' || !r.shopify_order_id) {
        continue;
      }
      if (!groups[r.store_id]) {
        groups[r.store_id] = {
          shopDomain: r.shop_domain,
          accessToken: r.access_token,
          items: []
        };
      }
      groups[r.store_id].items.push(r);
    }

    for (const storeId of Object.keys(groups)) {
      const { shopDomain, accessToken, items } = groups[storeId];
      try {
        const idToItemMap = {};
        const gids = [];
        for (const item of items) {
          const rawId = String(item.shopify_order_id);
          const gid = rawId.startsWith('gid://') ? rawId : `gid://shopify/Order/${rawId}`;
          gids.push(gid);
          idToItemMap[gid] = item;
        }

        const queryGidList = gids.map(id => `"${id}"`).join(',');
        const getQuery = `
          query {
            nodes(ids: [${queryGidList}]) {
              id
              ... on Order {
                tags
              }
            }
          }
        `;

        const getRes = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: getQuery }),
          timeout: 20000
        });

        if (!getRes.ok) {
          throw new Error(`GraphQL query failed: ${getRes.status} ${getRes.statusText}`);
        }

        const getResult = await getRes.json();
        if (getResult.errors) {
          throw new Error(`GraphQL query errors: ${JSON.stringify(getResult.errors)}`);
        }

        const nodes = getResult.data?.nodes || [];
        const updates = [];

        for (const node of nodes) {
          if (!node || !node.id) continue;
          const item = idToItemMap[node.id];
          if (!item) continue;

          const existingTags = node.tags || [];
          const cleanedTags = existingTags.filter(t => !t.startsWith('Trace:'));
          cleanedTags.push(item.erp_status);

          updates.push({
            gid: node.id,
            tags: cleanedTags,
            pollId: item.poll_id,
            orderId: item.order_id,
            erpStatus: item.erp_status
          });
        }

        if (updates.length === 0) continue;

        let mutationBody = 'mutation {\n';
        updates.forEach((u, index) => {
          const tagsArrayStr = JSON.stringify(u.tags);
          mutationBody += `  update_${index}: orderUpdate(input: { id: "${u.gid}", tags: ${tagsArrayStr} }) {\n`;
          mutationBody += `    order { id }\n`;
          mutationBody += `    userErrors { field message }\n`;
          mutationBody += `  }\n`;
        });
        mutationBody += '}';

        const mutRes = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: mutationBody }),
          timeout: 20000
        });

        if (!mutRes.ok) {
          throw new Error(`GraphQL mutation failed: ${mutRes.status} ${mutRes.statusText}`);
        }

        const mutResult = await mutRes.json();
        if (mutResult.errors) {
          throw new Error(`GraphQL mutation errors: ${JSON.stringify(mutResult.errors)}`);
        }

        db.transaction(() => {
          updates.forEach((u, index) => {
            const updateResult = mutResult.data?.[`update_${index}`];
            const errors = updateResult?.userErrors || [];
            if (errors.length === 0) {
              db.prepare(`
                UPDATE whatsapp_polls
                SET shopify_synced = 1
                WHERE id = ?
              `).run(u.pollId);
              console.log(`[Shopify_Sync] 🔄 Synced Order #${u.orderId} (GraphQL) to tag "${u.erpStatus}".`);
            } else {
              console.error(`[Shopify_Sync] ❌ Failed to update Shopify Order ${u.gid}: ${JSON.stringify(errors)}`);
            }
          });
        })();

      } catch (err) {
        console.error(`[Shopify_Sync] ❌ Batch sync failed for store ${shopDomain}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[Shopify_Sync] Batch build error for tenant ${tenantId}:`, err.message);
  }
}

async function runShopifySync() {
  const tenants = getAllTenants();
  for (const tenantId of tenants) {
    await tenantContext.run(tenantId, async () => {
      try {
        // Query pending records (erp_status is set, and shopify_synced is 0)
        const pending = db.prepare(`
          SELECT id, order_id, erp_status
          FROM whatsapp_polls
          WHERE erp_status IS NOT NULL
            AND shopify_synced = 0
          LIMIT 20
        `).all();

        if (pending.length === 0) return;
        await syncShopifyTagsInBatch(tenantId, pending);
      } catch (err) {
        // Ignore table not found errors or context issues
      }
    });
  }
}

module.exports = function startShopifySyncJob() {
  console.log('🔄 background Shopify tag sync worker registered (15-min interval)');
  
  // Run once immediately on start (in background)
  setImmediate(runShopifySync);

  // Set interval to run every 15 minutes
  setInterval(runShopifySync, 15 * 60 * 1000);
};
