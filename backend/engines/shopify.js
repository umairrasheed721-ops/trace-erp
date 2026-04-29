const fetch = require('node-fetch');
const db = require('../db');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHUNK_SIZE = 50;

function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function detectCourier(tracking, tags = '', shopifyCarrier = '') {
  const pvtTag = (tags || '').split(',').find(t => t.trim().toUpperCase().startsWith('PVT:'));
  if (pvtTag) return pvtTag.split(':')[1].trim();
  if (!tracking) return shopifyCarrier === 'Other' ? '' : shopifyCarrier;
  if (tracking.startsWith('28') || tracking.startsWith('21')) return 'PostEx';
  if (tracking.startsWith('LE')) return 'Leopards';
  if (tracking.startsWith('1730')) return 'TCS';
  if (tracking.startsWith('PVT')) return 'Private Rider';
  return shopifyCarrier === 'Other' ? '' : shopifyCarrier;
}

function detectOrderSource(order) {
  if (order.landing_site) {
    const ls = order.landing_site.toLowerCase();
    if (ls.includes('utm_source=tiktok')) return 'TikTok Ads';
    if (ls.includes('utm_source=facebook') || ls.includes('utm_source=fb')) return 'Facebook Ads';
    if (ls.includes('utm_source=ig') || ls.includes('utm_source=instagram')) return 'Instagram Ads';
  }
  if (order.referring_site) {
    const ref = order.referring_site.toLowerCase();
    if (ref.includes('instagram.com')) return 'Instagram Organic';
    if (ref.includes('facebook.com')) return 'Facebook Organic';
    if (ref.includes('tiktok.com')) return 'TikTok Organic';
  }
  return order.source_name || 'Direct / Web';
}

async function fetchShopifyOrders(store, onProgress, options = {}) {
  const { id: storeId, shop_domain, access_token, sync_start_date } = store;
  if (!access_token || access_token === 'PENDING') return { added: 0 };

  const updateStatus = (status, progress, processed = 0, total = 0) => {
    try {
      db.prepare('UPDATE stores SET sync_status = ?, sync_progress = ?, sync_processed = ?, sync_total = ? WHERE id = ?')
        .run(status, progress, processed, total, storeId);
    } catch (e) { console.error('Status Error:', e.message); }
    if (onProgress) onProgress(status, progress, processed, total);
  };

  try {
    updateStatus('syncing', 'Initializing sync...');
    const { forceDeepSync = false } = options;
    const dateMin = sync_start_date ? new Date(sync_start_date).toISOString() : getDaysAgo(70);
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc&created_at_min=${dateMin}`;

    const existingRows = db.prepare('SELECT shopify_order_id FROM orders WHERE store_id = ?').all(storeId);
    const existingIds = new Set(existingRows.map(r => String(r.shopify_order_id)));

    let newOrdersFound = [];
    let totalScanned = 0;
    let keepFetching = true;

    while (nextUrl && keepFetching) {
      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': access_token } });

      const rateLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (rateLimit) {
        const [used, total] = rateLimit.split('/').map(Number);
        if (used >= total - 5) await sleep(2000);
      }

      const data = await res.json();
      const batch = data.orders || [];
      if (!batch.length) break;

      totalScanned += batch.length;
      const newlyFoundInBatch = batch.filter(o => !existingIds.has(String(o.id)));
      newOrdersFound.push(...newlyFoundInBatch);

      updateStatus('syncing', `Scanning batch... Scanned ${totalScanned} orders. Found ${newOrdersFound.length} new.`, totalScanned, totalScanned + 100);
      console.log(`[ShopifySync] ${shop_domain}: Scanned ${totalScanned}, New ${newOrdersFound.length}`);

      if (!forceDeepSync && newlyFoundInBatch.length < batch.length) {
        keepFetching = false;
      }

      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = keepFetching && nextMatch ? nextMatch[1] : null;
    }

    if (!newOrdersFound.length) {
      updateStatus('idle', 'Finished. No new orders found.');
      return { added: 0 };
    }

    const allVariantIds = [...new Set(
      newOrdersFound.flatMap(o => o.line_items.map(i => i.variant_id).filter(Boolean))
    )];
    
    updateStatus('syncing', `Fetching costs for ${allVariantIds.length} variants...`, totalScanned, totalScanned + 50);
    const costMap = await getLiveShopifyCosts(shop_domain, access_token, allVariantIds, (msg) => updateStatus('syncing', msg, totalScanned, totalScanned + 50));

    const insertOrder = db.prepare(`
      INSERT OR IGNORE INTO orders (
        store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
        address, city, price, tracking_number, items_count, notes, product_titles,
        delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `);

    const insertMany = db.transaction(orders => {
      let count = 0;
      for (const order of orders) {
        try {
          const addr = order.shipping_address || {};
          const customer = order.customer || {};
          const finalPrice = parseFloat(order.current_total_price || order.total_price || 0);

          let totalCost = 0, productTitles = [], activeCount = 0;
          order.line_items.forEach(item => {
            const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
            if (qty === 0) return;
            totalCost += (costMap[String(item.variant_id)] || 0) * qty;
            productTitles.push(`${item.name} (x${qty})`);
            activeCount++;
          });

          const fulfillments = (order.fulfillments || []).filter(f => f.status !== 'cancelled');
          const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
          const tracking = ful?.tracking_number || '';
          const courier = detectCourier(tracking, order.tags, ful?.tracking_company);
          const source = detectOrderSource(order);

          insertOrder.run(
            storeId, String(order.id), order.name,
            `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || (customer.first_name || ''),
            (order.created_at || '').split('T')[0],
            addr.phone || customer.phone || '',
            `${addr.address1 || ''} ${addr.city || ''}`.trim(),
            addr.city || '',
            finalPrice, tracking, activeCount, order.note || '',
            productTitles.join(', '),
            order.cancelled_at ? 'Cancelled' : 'Pending',
            order.financial_status === 'paid' ? 'Paid' : 'Pending',
            0.5, courier, totalCost, source
          );
          count++;
        } catch (e) {
          console.error(`Skip order ${order.id}: ${e.message}`);
        }
      }
      return count;
    });

    updateStatus('syncing', `Saving ${newOrdersFound.length} orders...`, 95, 100);
    const added = insertMany(newOrdersFound.reverse());

    db.prepare("UPDATE stores SET last_synced_at = datetime('now') WHERE id = ?").run(storeId);
    console.log(`✅ Shopify Fetch [${shop_domain}]: Added ${added} new orders`);
    updateStatus('idle', `Finished. Added ${added} orders.`);
    return { added };
  } catch (err) {
    console.error(`Sync error for ${shop_domain}:`, err.message);
    updateStatus('error', `Sync failed: ${err.message}`);
    throw err;
  }
}

async function refreshShopifyUpdates(store, onProgress) {
  const { id: storeId, shop_domain, access_token } = store;
  const updateStatus = (status, progress, processed = 0, total = 0) => {
    try {
      db.prepare('UPDATE stores SET sync_status = ?, sync_progress = ?, sync_processed = ?, sync_total = ? WHERE id = ?')
        .run(status, progress, processed, total, storeId);
    } catch (e) { console.error('Status Error:', e.message); }
    if (onProgress) onProgress(status, progress, processed, total);
  };

  if (!access_token || access_token === 'PENDING') return { updated: 0 };
  
  try {
    const dateMin = getDaysAgo(180); 
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=updated_at+desc&updated_at_min=${dateMin}`;

    let updatedOrders = [];

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': access_token } });
      const rateLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (rateLimit) {
        const [used, total] = rateLimit.split('/').map(Number);
        if (used >= total - 5) await sleep(2000);
      }

      const data = await res.json();
      const batch = data.orders || [];
      if (!batch.length) break;
      updatedOrders = updatedOrders.concat(batch);
      updateStatus('syncing', `Scanning updates... Found ${updatedOrders.length}`, updatedOrders.length, updatedOrders.length + 100);

      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = nextMatch ? nextMatch[1] : null;
    }

    if (!updatedOrders.length) {
      updateStatus('idle', 'Finished. No updates found.');
      return { updated: 0 };
    }

    const shopifyMap = {};
    const allVariantIds = [];
    
    const existingOrders = db.prepare('SELECT shopify_order_id, delivery_status FROM orders WHERE store_id = ?').all(storeId);
    const statusMap = {};
    existingOrders.forEach(o => { statusMap[String(o.shopify_order_id)] = o.delivery_status; });

    updatedOrders.forEach(o => {
      const oId = String(o.id);
      shopifyMap[oId] = o;
      const currentStatus = statusMap[oId] || 'Pending';
      const isCancelled = o.cancelled_at !== null;
      const isReturned = currentStatus === 'Returned' || currentStatus === 'RTO' || currentStatus === 'Returned to Origin';
      if (!isCancelled && !isReturned) {
        o.line_items.forEach(i => { if (i.variant_id) allVariantIds.push(i.variant_id); });
      }
    });

    updateStatus('syncing', 'Fetching costs for updates...', 0, 0);
    const costMap = await getLiveShopifyCosts(shop_domain, access_token, [...new Set(allVariantIds)], (msg) => {
      updateStatus('syncing', msg, 50, 100);
    });

    const sheetOrders = db.prepare('SELECT id, shopify_order_id, delivery_status FROM orders WHERE store_id = ?').all(storeId);

    let count = 0;
    const updateStmt = db.prepare(`
      UPDATE orders SET price=?, items_count=?, notes=?, product_titles=?,
      payment_status=?, cost=?, tracking_number=?, courier=?, delivery_status=?
      WHERE id=?
    `);

    const updateMany = db.transaction(rows => {
      for (const row of rows) {
        const fresh = shopifyMap[String(row.shopify_order_id)];
        if (!fresh) continue;

        const currentStatus = (row.delivery_status || '').trim().toLowerCase();
        const isProtected = currentStatus === 'return received' || currentStatus === 'delivered';

        const finalPrice = parseFloat(fresh.current_total_price || fresh.total_price || 0);
        let totalCost = 0, productTitles = [];

        const isCancelled = fresh.cancelled_at !== null;
        const dbStatus = (row.delivery_status || '').trim().toLowerCase();
        const isReturned = dbStatus === 'returned' || dbStatus === 'rto' || dbStatus === 'returned to origin';

        if (!isCancelled && !isReturned) {
          fresh.line_items.forEach(item => {
            const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
            if (qty === 0) return;
            totalCost += (costMap[String(item.variant_id)] || 0) * qty;
            productTitles.push(`${item.name} (x${qty})`);
          });
        }

        const fulfillments = (fresh.fulfillments || []).filter(f => f.status !== 'cancelled');
        const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
        const tracking = ful?.tracking_number || '';
        const courier = detectCourier(tracking, fresh.tags, ful?.tracking_company);

        let newDeliveryStatus = row.delivery_status;
        if (fresh.cancelled_at && !isProtected) newDeliveryStatus = 'Cancelled';

        updateStmt.run(
          finalPrice, productTitles.length, fresh.note || '',
          productTitles.join(', '),
          fresh.financial_status === 'paid' ? 'Paid' : 'Pending',
          totalCost, tracking, courier, newDeliveryStatus, row.id
        );
        count++;
      }
      return count;
    });

    updateMany(sheetOrders);
    db.prepare("UPDATE stores SET last_synced_at = datetime('now') WHERE id = ?").run(storeId);
    console.log(`✅ Shopify Refresh [${shop_domain}]: Synced ${count} orders`);
    updateStatus('idle', `Finished. Refreshed ${count} orders.`);
    return { updated: count };
  } catch (err) {
    updateStatus('error', `Refresh failed: ${err.message}`);
    throw err;
  }
}

async function getLiveShopifyCosts(shopDomain, accessToken, variantIds, onProgress) {
  const costMap = {};
  if (!variantIds || !variantIds.length) return costMap;

  const uniqueIds = [...new Set(variantIds.map(id => String(id)))];
  const variantToInventoryItem = {};
  const inventoryItemIds = new Set();

  console.log(`[CostSync] Fetching ${uniqueIds.length} variants via GraphQL`);

  // Step 1: Get inventory_item_id for each variant via GraphQL
  const gqlChunkSize = 100;
  for (let i = 0; i < uniqueIds.length; i += gqlChunkSize) {
    const chunk = uniqueIds.slice(i, i + gqlChunkSize);
    if (onProgress) onProgress(`Fetching variants ${i} to ${Math.min(i + gqlChunkSize, uniqueIds.length)}...`);
    const gidList = chunk.map(id => `"gid://shopify/ProductVariant/${id}"`).join(',');
    
    const query = `
      query {
        nodes(ids: [${gidList}]) {
          ... on ProductVariant {
            id
            inventoryItem {
              id
            }
          }
        }
      }
    `;

    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      try {
        const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query })
        });

        if (res.status === 429) {
          await sleep(2000);
          attempts++;
          continue;
        }

        const result = await res.json();
        const nodes = result.data?.nodes || [];
        
        nodes.forEach(node => {
          if (node && node.id && node.inventoryItem) {
            const vId = node.id.split('/').pop();
            const iiId = node.inventoryItem.id.split('/').pop();
            variantToInventoryItem[vId] = iiId;
            inventoryItemIds.add(iiId);
          }
        });
        success = true;
      } catch (e) {
        attempts++;
        await sleep(1000);
      }
    }
  }

  // Step 2: Get cost for each inventory_item_id (REST is fine here)
  const inventoryItemIdsArray = Array.from(inventoryItemIds);
  const inventoryItemToCost = {};
  const REST_CHUNK = 50;

  for (let i = 0; i < inventoryItemIdsArray.length; i += REST_CHUNK) {
    const chunk = inventoryItemIdsArray.slice(i, i + REST_CHUNK);
    if (onProgress) onProgress(`Fetching costs ${i} to ${Math.min(i + REST_CHUNK, inventoryItemIdsArray.length)}...`);
    let success = false;
    let attempts = 0;

    while (!success && attempts < 3) {
      try {
        const res = await fetch(
          `https://${shopDomain}/admin/api/2024-10/inventory_items.json?ids=${chunk.join(',')}`,
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );

        if (res.status === 429) {
          await sleep(2000);
          attempts++;
          continue;
        }

        const data = await res.json();
        (data.inventory_items || []).forEach(item => {
          inventoryItemToCost[String(item.id)] = parseFloat(item.cost || 0);
        });
        success = true;
      } catch (e) {
        attempts++;
        await sleep(1000);
      }
    }
  }

  // Step 3: Map back (always ensure all requested IDs are in the map)
  uniqueIds.forEach(vId => {
    const iiId = variantToInventoryItem[vId];
    costMap[vId] = iiId ? (inventoryItemToCost[iiId] || 0) : 0;
  });

  return costMap;
async function syncSingleShopifyOrder(store, shopifyOrderId) {
  const { id: storeId, shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return null;

  try {
    const res = await fetch(`https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}.json`, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });
    if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
    const data = await res.json();
    const order = data.order;
    if (!order) return null;

    const variantIds = [];
    order.line_items.forEach(i => { if (i.variant_id) variantIds.push(i.variant_id); });
    const costMap = await getLiveShopifyCosts(shop_domain, access_token, [...new Set(variantIds)]);

    const addr = order.shipping_address || {};
    const customer = order.customer || {};
    const finalPrice = parseFloat(order.current_total_price || order.total_price || 0);

    let totalCost = 0, productTitles = [], activeCount = 0;
    const isCancelled = order.cancelled_at !== null;
    
    const existing = db.prepare('SELECT id, delivery_status FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(storeId, String(shopifyOrderId));
    const dbStatus = (existing?.delivery_status || '').trim().toLowerCase();
    const isReturned = dbStatus === 'returned' || dbStatus === 'rto' || dbStatus === 'returned to origin';
    const isProtected = dbStatus === 'return received' || dbStatus === 'delivered';

    if (!isCancelled && !isReturned) {
      order.line_items.forEach(item => {
        const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
        if (qty === 0) return;
        totalCost += (costMap[String(item.variant_id)] || 0) * qty;
        productTitles.push(`${item.name} (x${qty})`);
        activeCount++;
      });
    }

    const fulfillments = (order.fulfillments || []).filter(f => f.status !== 'cancelled');
    const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
    const tracking = ful?.tracking_number || '';
    const courier = detectCourier(tracking, order.tags, ful?.tracking_company);
    const source = detectOrderSource(order);

    let newDeliveryStatus = existing ? existing.delivery_status : 'Pending';
    if (order.cancelled_at && !isProtected) newDeliveryStatus = 'Cancelled';

    if (existing) {
      db.prepare(`
        UPDATE orders SET price=?, items_count=?, notes=?, product_titles=?,
        payment_status=?, cost=?, tracking_number=?, courier=?, delivery_status=?, status_date=datetime('now')
        WHERE id=?
      `).run(
        finalPrice, activeCount, order.note || '', productTitles.join(', '),
        order.financial_status === 'paid' ? 'Paid' : 'Pending',
        totalCost, tracking, courier, newDeliveryStatus, existing.id
      );
      console.log(`⚡ [Hybrid Sync] Updated order ${shopifyOrderId}`);
    } else {
      db.prepare(`
        INSERT INTO orders (
          store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
          address, city, price, tracking_number, items_count, notes, product_titles,
          delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(
        storeId, String(order.id), order.name,
        `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || (customer.first_name || ''),
        (order.created_at || '').split('T')[0],
        addr.phone || customer.phone || '',
        `${addr.address1 || ''} ${addr.city || ''}`.trim(),
        addr.city || '',
        finalPrice, tracking, activeCount, order.note || '', productTitles.join(', '),
        newDeliveryStatus,
        order.financial_status === 'paid' ? 'Paid' : 'Pending',
        0.5, courier, totalCost, source
      );
      console.log(`⚡ [Hybrid Sync] Inserted new order ${shopifyOrderId}`);
    }
    return true;
  } catch (err) {
    console.error(`Hybrid Sync Error for ${shopifyOrderId}:`, err.message);
    return false;
  }
}

async function registerShopifyWebhooks(store, appUrl) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');
  
  const topics = ['orders/create', 'orders/updated'];
  let successCount = 0;

  for (const topic of topics) {
    const res = await fetch(`https://${shop_domain}/admin/api/2024-10/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: {
          topic,
          address: `${appUrl}/api/webhooks/shopify`,
          format: "json"
        }
      })
    });
    
    // 422 means it's likely already registered for this address
    if (res.ok || res.status === 422) successCount++;
  }
  
  return successCount === topics.length;
}

module.exports = { fetchShopifyOrders, refreshShopifyUpdates, getLiveShopifyCosts, syncSingleShopifyOrder, registerShopifyWebhooks };
