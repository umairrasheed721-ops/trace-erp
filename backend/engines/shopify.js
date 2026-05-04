const fetch = require('node-fetch');
const API_TIMEOUT = 15000; // 15s Circuit Breaker
const db = require('../db');
const bot = require('./whatsapp_bot');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function saveRawPayload(type, payload) {
  try {
    const filename = `${type}-${Date.now()}.json`;
    const filepath = path.join(__dirname, '../debug_storage', filename);
    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
    console.log(`💾 [DebugStorage] Saved raw payload: ${filename}`);
  } catch (err) {
    console.error('Failed to save raw payload:', err.message);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHUNK_SIZE = 50;

async function fetchWithRetry(url, options, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, timeout: API_TIMEOUT });
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || backoff;
        await sleep(parseInt(retryAfter) * 1.5);
        continue;
      }
      if (response.ok) return response;
      if (response.status >= 500) {
         await sleep(backoff * Math.pow(2, i));
         continue;
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(backoff * Math.pow(2, i));
    }
  }
}

function logAudit(storeId, level, message, trackingNumber = null) {
  try {
    db.prepare('INSERT INTO sync_audit (store_id, level, message, tracking_number) VALUES (?, ?, ?, ?)').run(storeId, level, message, trackingNumber);
  } catch (e) { console.error('Audit Log Error:', e.message); }
}

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

const registryLookupStmt = db.prepare(`
  SELECT landed_cost, shopify_cost FROM product_master_costs 
  WHERE store_id = ? 
  AND (
    shopify_variant_id = ? 
    OR (parent_title = ? AND (variant_title = ? OR variant_title = '' OR variant_title IS NULL))
  )
  ORDER BY (CASE WHEN shopify_variant_id = ? THEN 0 ELSE 1 END) ASC, 
           (CASE WHEN variant_title = ? THEN 0 ELSE 1 END) ASC
  LIMIT 1
`);

function calculateOrderCost(storeId, lineItems, costMap) {
  let totalCost = 0;
  let activeCount = 0;
  let productTitles = [];

  for (const item of lineItems) {
    const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
    if (qty === 0) continue;

    const variantId = String(item.variant_id);
    let unitCost = 0;
    const shopifyCost = costMap[variantId] || 0;

    // 🛡️ STRICT COST SHIELD: Check Master Registry FIRST
    const parts = item.name.split(' - ');
    const pName = parts[0].trim();
    const vName = parts.length > 1 ? parts[1].trim() : '';
    
    const registry = registryLookupStmt.get(storeId, variantId, pName, vName, variantId, vName);
    
    if (registry && (registry.landed_cost > 0 || registry.shopify_cost > 0)) {
      unitCost = registry.landed_cost || registry.shopify_cost || 0;
      
      // ⚠️ COST DRIFT DETECTION
      if (shopifyCost > 0 && Math.abs(shopifyCost - unitCost) > (unitCost * 0.05)) {
        logAudit(storeId, 'WARN', `Cost Drift: ${item.name} registry cost is ${unitCost} but Shopify says ${shopifyCost}. Difference: ${Math.round(Math.abs(shopifyCost - unitCost))}`);
      }
    } else {
      // Fallback to Shopify's current cost if registry is empty
      unitCost = shopifyCost;
    }

    totalCost += unitCost * qty;
    productTitles.push(`${item.name} (x${qty})`);
    activeCount++;
  }

  return { totalCost, productTitles: productTitles.join(', '), activeCount };
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

  const CHUNK_SIZE = 500; // Process and insert 500 orders at a time

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (
      store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
      address, city, price, tracking_number, items_count, notes, product_titles,
      delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date, confirmation_token
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)
  `);

  const insertChunk = db.transaction((orders, costMap) => {
    let count = 0;
    for (const order of orders) {
      try {
        const addr = order.shipping_address || {};
        const customer = order.customer || {};
        const finalPrice = parseFloat(order.current_total_price || order.total_price || 0);

        const { totalCost, productTitles, activeCount } = calculateOrderCost(storeId, order.line_items, costMap);

        const fulfillments = (order.fulfillments || []).filter(f => f.status !== 'cancelled');
        const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
        const tracking = ful?.tracking_number || '';
        const courier = detectCourier(tracking, order.tags, ful?.tracking_company);
        const source = detectOrderSource(order);
        const status = mapShopifyStatus(order);
        const token = crypto.randomBytes(16).toString('hex');

        const firstName = (addr.first_name || '').trim();
        const lastName = (addr.last_name || '').trim();
        const fullName = (firstName === lastName ? firstName : `${firstName} ${lastName}`.trim()) || (customer.first_name || '');

        const addressStr = [addr.address1, addr.address2].filter(Boolean).join(' ').trim();

        insertOrder.run(
          storeId, String(order.id), order.name,
          fullName,
          (order.created_at || '').split('T')[0],
          addr.phone || customer.phone || '',
          addressStr || '—',
          addr.city || '',
          finalPrice, tracking, activeCount, order.note || '',
          productTitles,
          status,
          order.financial_status === 'paid' ? 'Paid' : 
          (order.financial_status === 'voided' ? 'Voided' : 'Pending'),
          0.5, courier, totalCost, source, token
        );

        // 🤖 AUTO-WHATSAPP TRIGGER
        if (status === 'Pending' && (addr.phone || customer.phone)) {
          const appUrl = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';
          const link = `${appUrl}/api/public/confirm-order/${token}`;
          const msg = `Hi ${fullName}, thank you for your order ${order.name} at TRACE! 📦\n\nPlease confirm your order by clicking here: ${link}`;
          bot.sendMessage(addr.phone || customer.phone, msg);
        }

        count++;
      } catch (e) {
        console.error(`Skip order ${order.id}: ${e.message}`);
      }
    }
    return count;
  });

  try {
    const traceId = `SYNC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    updateStatus('syncing', 'Initializing sync...');
    console.log(`🆔 [TraceID: ${traceId}] Sync started.`);
    const { forceDeepSync = false } = options;
    // Deep Sync ignores the dateMin limit entirely
    const dateMin = forceDeepSync ? '2010-01-01T00:00:00Z' : (sync_start_date ? new Date(sync_start_date).toISOString() : getDaysAgo(70));
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc&created_at_min=${dateMin}`;

    console.log(`🚀 [ShopifySync] Starting sync for ${shop_domain}`);
    console.log(`📅 [ShopifySync] Min Date: ${dateMin}, forceDeepSync: ${forceDeepSync}`);
    console.log(`🔗 [ShopifySync] Initial URL: ${nextUrl}`);

    const existingRows = db.prepare('SELECT shopify_order_id FROM orders WHERE store_id = ?').all(storeId);
    const existingIds = new Set(existingRows.map(r => String(r.shopify_order_id)));

    let totalAdded = 0;
    let totalScanned = 0;

    // ── STREAMING SYNC: Process batch-by-batch to save memory ─────────
    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': access_token }, timeout: API_TIMEOUT });

      const rateLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (rateLimit) {
        const [used, total] = rateLimit.split('/').map(Number);
        if (used >= total - 5) await sleep(2000);
      }

      const data = await res.json();
      const batch = data.orders || [];
      console.log(`📦 [ShopifySync] Batch received: ${batch.length} orders.`);
      
      if (!batch.length && totalScanned === 0) {
        console.warn(`⚠️ [ShopifySync] ZERO orders found for ${shop_domain}. Check API scopes!`);
        break;
      }
      if (!batch.length) break;

      totalScanned += batch.length;
      
      // Filter out what we already have
      const newlyFoundInBatch = batch.filter(o => !existingIds.has(String(o.id)));
      
      if (newlyFoundInBatch.length > 0) {
        updateStatus('syncing', `Processing batch... ${totalScanned} scanned, ${totalAdded + newlyFoundInBatch.length} saved.`, totalAdded, totalAdded + 500);

        // Fetch costs for JUST this batch (Efficient!)
        const batchVariantIds = [...new Set(
          newlyFoundInBatch.flatMap(o => o.line_items.map(i => i.variant_id).filter(Boolean))
        )];

        const costMap = await getLiveShopifyCosts(
          shop_domain, access_token, batchVariantIds,
          (msg) => updateStatus('syncing', `Batch Progress: ${msg}`, totalAdded, totalAdded + 500)
        );

        // Insert immediately
        const added = insertChunk(newlyFoundInBatch.reverse(), costMap);
        totalAdded += added;
        
        // Add to our known set so we don't double-count if the loop repeats
        newlyFoundInBatch.forEach(o => existingIds.add(String(o.id)));
        
        db.prepare("UPDATE stores SET last_synced_at = datetime('now') WHERE id = ?").run(storeId);
        console.log(`✅ [ShopifySync] Batch processed: ${added} added. Total so far: ${totalAdded}`);
      }

      // If we found duplicates in this batch and forceDeepSync is false, we can stop
      if (!forceDeepSync && newlyFoundInBatch.length < batch.length) {
        console.log(`🛑 [ShopifySync] Reached overlap with existing data. Stopping.`);
        break;
      }

      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = nextMatch ? nextMatch[1] : null;
    }

    console.log(`✅ Shopify Fetch [${shop_domain}]: Finished. Total added: ${totalAdded}`);
    updateStatus('idle', `Finished. Added ${totalAdded} orders.`);
    return { added: totalAdded };
  } catch (err) {
    console.error(`Sync error for ${shop_domain}:`, err.message);
    updateStatus('error', `Sync failed: ${err.message}`);
    throw err;
  }
}

async function refreshShopifyUpdates(store, onProgress, options = {}) {
  const { id: storeId, shop_domain, access_token } = store;
  const updateStatus = (status, progress, processed = 0, total = 0) => {
    try {
      db.prepare('UPDATE stores SET sync_status = ?, sync_progress = ?, sync_processed = ?, sync_total = ? WHERE id = ?')
        .run(status, progress, processed, total, storeId);
    } catch (e) { console.error('Status Error:', e.message); }
    if (onProgress) onProgress(status, progress, processed, total);
  };

  if (!access_token || access_token === 'PENDING') return { updated: 0 };
  
  // New: Separate flags for Status vs Costs
  const syncStatus = options.syncStatus !== undefined ? options.syncStatus : true;
  const syncCosts = options.syncCosts !== undefined ? options.syncCosts : (options.forceDeepSync ? true : false);

  try {
    // If deep sync, use the store's sync_start_date (allows 2020+). 
    // Otherwise, use 60 days for a fast refresh.
    const dateMin = options.forceDeepSync 
      ? (store.sync_start_date ? store.sync_start_date + 'T00:00:00Z' : getDaysAgo(730))
      : getDaysAgo(60);
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=updated_at+desc&updated_at_min=${dateMin}`;

    let updatedOrders = [];

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': access_token }, timeout: API_TIMEOUT });
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

    let costMap = {};
    if (syncCosts) {
      updateStatus('syncing', `Fetching costs for ${[...new Set(allVariantIds)].length} variants...`, 0, 0);
      costMap = await getLiveShopifyCosts(shop_domain, access_token, [...new Set(allVariantIds)], (msg) => {
        updateStatus('syncing', msg, 50, 100);
      });
    } else {
      updateStatus('syncing', 'Skipping costs (Status Only mode)...', 0, 0);
    }

    const sheetOrders = db.prepare('SELECT id, shopify_order_id, delivery_status, cost, courier_fee, cost_locked, courier_fee_locked FROM orders WHERE store_id = ?').all(storeId);

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
        let totalCost = 0, productTitles = [], activeCount = 0;

        const isCancelled = fresh.cancelled_at !== null;
        const dbStatus = (row.delivery_status || '').trim().toLowerCase();
        const isReturned = dbStatus === 'returned' || dbStatus === 'rto' || dbStatus === 'returned to origin';

        if (!isCancelled && !isReturned) {
          for (const item of fresh.line_items) {
            const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
            if (qty === 0) continue;
            
            let unitCost = costMap[String(item.variant_id)] || 0;
            
            // 🛡️ FALLBACK: If Shopify returns 0, check our Master Cost Registry
            if (unitCost === 0) {
              const parts = item.name.split(' - ');
              const pName = parts[0].trim();
              const vName = parts.length > 1 ? parts[1].trim() : '';
              
              const registry = db.prepare(`
                SELECT landed_cost FROM product_master_costs 
                WHERE store_id = ? AND parent_title = ? 
                AND (variant_title = ? OR variant_title = '' OR variant_title IS NULL)
                ORDER BY (CASE WHEN variant_title = ? THEN 0 ELSE 1 END) ASC
                LIMIT 1
              `).get(storeId, pName, vName, vName);
              
              if (registry) unitCost = registry.landed_cost || 0;
            }

            totalCost += unitCost * qty;
            productTitles.push(`${item.name} (x${qty})`);
            activeCount++;
          }
        }

        const fulfillments = (fresh.fulfillments || []).filter(f => f.status !== 'cancelled');
        const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
        const tracking = ful?.tracking_number || '';
        const courier = detectCourier(tracking, fresh.tags, ful?.tracking_company);

        let newDeliveryStatus = row.delivery_status;
        const mappedStatus = mapShopifyStatus(fresh);
        
        if (isProtected) {
          // Stay protected
        } else if (mappedStatus === 'Cancelled' || mappedStatus === 'Voided' || mappedStatus === 'Returned') {
          newDeliveryStatus = mappedStatus;
        } else if (fresh.fulfillment_status === 'fulfilled' && (newDeliveryStatus === 'Pending' || !newDeliveryStatus)) {
          newDeliveryStatus = 'Booked';
        }

        updateStmt.run(
          finalPrice, activeCount, fresh.note || '',
          productTitles.join(', '),
          fresh.financial_status === 'paid' ? 'Paid' : (fresh.financial_status === 'voided' ? 'Voided' : 'Pending'),
          row.cost_locked ? row.cost : (totalCost > 0 ? totalCost : (row.cost || 0)), // 🛡️ Zero-Cost Lock
          tracking, 
          row.courier_fee_locked ? row.courier_fee : courier, 
          newDeliveryStatus, 
          row.id
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

function mapShopifyStatus(order) {
  if (order.cancelled_at) return 'Cancelled';
  if (order.financial_status === 'voided') return 'Voided';
  if (order.return_status === 'returned' || order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') return 'Returned';
  if (order.fulfillment_status === 'fulfilled') return 'Booked';
  return 'Pending';
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
          timeout: API_TIMEOUT,
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
          { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: API_TIMEOUT }
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
}

async function syncSingleShopifyOrder(store, shopifyOrderId) {
  const { id: storeId, shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return null;

  try {
    const res = await fetch(`https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}.json`, {
      headers: { 'X-Shopify-Access-Token': access_token },
      timeout: API_TIMEOUT
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
      const { totalCost: tc, productTitles: titles, activeCount: count } = calculateOrderCost(storeId, order.line_items, costMap);
      totalCost = tc;
      productTitles = [titles]; // it expects an array based on original code usage?
      // Wait, original code: productTitles.push(`${item.name} (x${qty})`);
      // calculateOrderCost returns: productTitles.join(', ')
      // So productTitles should be the string result.
      productTitles = titles;
      activeCount = count;
    }

    const fulfillments = (order.fulfillments || []).filter(f => f.status !== 'cancelled');
    const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
    const tracking = ful?.tracking_number || '';
    const courier = detectCourier(tracking, order.tags, ful?.tracking_company);
    const source = detectOrderSource(order);

    let newDeliveryStatus = existing ? existing.delivery_status : 'Pending';
    const mappedStatus = mapShopifyStatus(order);

    if (isProtected) {
      // Stay protected
    } else if (mappedStatus === 'Cancelled' || mappedStatus === 'Voided' || mappedStatus === 'Returned') {
      newDeliveryStatus = mappedStatus;
    } else if (order.fulfillment_status === 'fulfilled' && (newDeliveryStatus === 'Pending' || !newDeliveryStatus)) {
      newDeliveryStatus = 'Booked';
    }

    if (existing) {
      db.prepare(`
        UPDATE orders SET price=?, items_count=?, notes=?, product_titles=?,
        payment_status=?, cost=?, tracking_number=?, courier=?, delivery_status=?, status_date=datetime('now')
        WHERE id=?
      `).run(
        finalPrice, activeCount, order.note || '', productTitles,
        order.financial_status === 'paid' ? 'Paid' : (order.financial_status === 'voided' ? 'Voided' : 'Pending'),
        (totalCost > 0 ? totalCost : (existing.cost || 0)), // 🛡️ Zero-Cost Lock
        tracking, courier, newDeliveryStatus, existing.id
      );
      console.log(`⚡ [Hybrid Sync] Updated order ${shopifyOrderId}`);
      try { require('../sse').broadcast('message', { type: 'order_updated', storeId, shopifyOrderId }); } catch(e) {}
    } else {
      const token = crypto.randomBytes(16).toString('hex');
      const fullName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || (customer.first_name || '');
      
      db.prepare(`
        INSERT INTO orders (
          store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
          address, city, price, tracking_number, items_count, notes, product_titles,
          delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date, confirmation_token
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)
      `).run(
        storeId, String(order.id), order.name,
        fullName,
        (order.created_at || '').split('T')[0],
        addr.phone || customer.phone || '',
        `${addr.address1 || ''} ${addr.city || ''}`.trim(),
        addr.city || '',
        finalPrice, tracking, activeCount, order.note || '', productTitles,
        newDeliveryStatus,
        order.financial_status === 'paid' ? 'Paid' : 'Pending',
        0.5, courier, totalCost, source, token
      );

      // 🤖 AUTO-WHATSAPP TRIGGER
      if (newDeliveryStatus === 'Pending' && (addr.phone || customer.phone)) {
        const appUrl = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';
        const link = `${appUrl}/api/public/confirm-order/${token}`;
        const msg = `Hi ${fullName}, thank you for your order ${order.name} at TRACE! 📦\n\nPlease confirm your order by clicking here: ${link}`;
        bot.sendMessage(addr.phone || customer.phone, msg);
      }

      console.log(`⚡ [Hybrid Sync] Inserted new order ${shopifyOrderId}`);
      try { require('../sse').broadcast('message', { type: 'order_updated', storeId, shopifyOrderId }); } catch(e) {}
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
      timeout: API_TIMEOUT,
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

async function fulfillShopifyOrder(store, shopifyOrderId, trackingNumber, courierName) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');

  // Step 1: Fetch fulfillment orders to get the fulfillment_order_id
  const foUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillment_orders.json`;
  const foRes = await fetch(foUrl, { headers: { 'X-Shopify-Access-Token': access_token }, timeout: API_TIMEOUT });
  const foData = await foRes.json();
  
  if (!foData.fulfillment_orders || !foData.fulfillment_orders.length) {
     throw new Error('No fulfillable orders found in Shopify');
  }

  // Find the first "open" fulfillment order
  const openFO = foData.fulfillment_orders.find(fo => fo.status === 'open') || foData.fulfillment_orders[0];
  const fulfillmentOrderId = openFO.id;

  // Step 2: Create the fulfillment
  const fUrl = `https://${shop_domain}/admin/api/2024-10/fulfillments.json`;
  const payload = {
    fulfillment: {
      line_items_by_fulfillment_order: [
        {
          fulfillment_order_id: fulfillmentOrderId,
          fulfillment_order_line_items: openFO.line_items.map(li => ({ id: li.id, quantity: li.quantity }))
        }
      ],
      tracking_info: {
        number: trackingNumber,
        company: courierName,
        url: courierName === 'PostEx' ? `https://postex.pk/tracking?tracking_number=${trackingNumber}` : ''
      },
      notify_customer: true
    }
  };

  const fRes = await fetch(fUrl, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!fRes.ok) {
    const errorData = await fRes.json();
    throw new Error(JSON.stringify(errorData.errors) || 'Shopify Fulfillment Failed');
  }

  return true;
}

async function updateShopifyAddress(store, shopifyOrderId, newAddress) {
  const { shop_domain, access_token } = store;
  const url = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
  
  const payload = {
    order: {
      id: shopifyOrderId,
      shipping_address: {
        address1: newAddress
      }
    }
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(JSON.stringify(errorData.errors) || 'Failed to update Shopify address');
  }
  return true;
}

async function syncOrderByNumber(store, orderName) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return null;

  try {
    // 1. Search for the order ID by its name (e.g. #16374)
    const searchUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?name=${encodeURIComponent(orderName)}&status=any`;
    const res = await fetch(searchUrl, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });
    const data = await res.json();
    const order = data.orders?.[0];
    if (!order) throw new Error(`Order ${orderName} not found in Shopify`);

    // 2. Use the existing syncSingleShopifyOrder function with the found ID
    return await syncSingleShopifyOrder(store, order.id);
  } catch (err) {
    console.error(`Error syncing order by number ${orderName}:`, err.message);
    throw err;
  }
}

async function syncSpecificOrders(store, shopifyIds) {
  const { shop_domain, access_token } = store;
  if (!shopifyIds.length) return 0;
  
  let updatedCount = 0;
  const idsParam = shopifyIds.join(',');
  const url = `https://${shop_domain}/admin/api/2024-10/orders.json?ids=${idsParam}&status=any`;

  try {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': access_token } });
    const data = await res.json();
    const shopifyOrders = data.orders || [];

    const updateStmt = db.prepare(`
      UPDATE orders SET price=?, items_count=?, notes=?, product_titles=?,
      payment_status=?, tracking_number=?, courier=?, delivery_status=?, status_date=datetime('now')
      WHERE shopify_order_id=? AND store_id=?
    `);

    for (const fresh of shopifyOrders) {
      const finalPrice = parseFloat(fresh.current_total_price || fresh.total_price || 0);
      let productTitles = [];
      fresh.line_items.forEach(item => {
        const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
        if (qty > 0) productTitles.push(`${item.name} (x${qty})`);
      });

      const fulfillments = (fresh.fulfillments || []).filter(f => f.status !== 'cancelled');
      const ful = fulfillments.length ? fulfillments[fulfillments.length - 1] : null;
      const tracking = ful?.tracking_number || '';
      const courier = detectCourier(tracking, fresh.tags, ful?.tracking_company);

      let newStatus = mapShopifyStatus(fresh);

      updateStmt.run(
        finalPrice, fresh.line_items.length, fresh.note || '',
        productTitles.join(', '),
        fresh.financial_status === 'paid' ? 'Paid' : (fresh.financial_status === 'voided' ? 'Voided' : 'Pending'),
        tracking, courier, newStatus,
        String(fresh.id), store.id
      );
      updatedCount++;
    }
  } catch (e) {
    console.error('Bulk Specific Sync Error:', e.message);
  }
  return updatedCount;
}

module.exports = { 
  fetchShopifyOrders, 
  refreshShopifyUpdates, 
  getLiveShopifyCosts, 
  syncSingleShopifyOrder, 
  syncOrderByNumber, 
  registerShopifyWebhooks, 
  fulfillShopifyOrder, 
  updateShopifyAddress,
  syncSpecificOrders,
  mapShopifyStatus 
};
