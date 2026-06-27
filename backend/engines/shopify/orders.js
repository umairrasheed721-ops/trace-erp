const fetch = require('../fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { smokeTestShopify, getLiveShopifyCosts, fetchVariantImagesGraphQL } = require('./products');

const API_TIMEOUT = 15000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function saveRawPayload(type, payload) {
  try {
    const filename = `${type}-${Date.now()}.json`;
    const filepath = path.join(__dirname, '../../debug_storage', filename);
    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
    console.log(`💾 [DebugStorage] Saved raw payload: ${filename}`);
  } catch (err) {
    console.error('Failed to save raw payload:', err.message);
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

  const cleanTracking = tracking.trim().toLowerCase();

  // 1. Detect Keyword Patterns (By Hand, Self, Local Rider, Pickup, etc.)
  const selfKeywords = ['hand', 'self', 'rider', 'local', 'office', 'pickup', 'personal'];
  if (selfKeywords.some(kw => cleanTracking.includes(kw))) {
    return 'Self Delivery';
  }

  // 2. Detect Date-based tracking numbers (e.g., 01/06/2026)
  const datePattern = /^(?:\d{1,4})[./-]\d{1,2}[./-](?:\d{1,4})$/;
  if (datePattern.test(cleanTracking)) {
    return 'Self Delivery';
  }

  if (/^2\d{13}$/.test(cleanTracking) || tracking.startsWith('28') || tracking.startsWith('21')) return 'PostEx';
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
    OR shopify_variant_id = ? 
    OR (sku = ? AND sku != '')
  )
  ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 ELSE 1 END) ASC, 
           (CASE WHEN sku = ? THEN 0 ELSE 1 END) ASC
  LIMIT 1
`);

function calculateOrderCost(storeId, lineItems, costMap) {
  let totalCost = 0;
  let activeCount = 0;
  let productTitles = [];

  for (const item of lineItems) {
    const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
    if (qty === 0) continue;

    const variantId = item.variant_id ? String(item.variant_id) : '';
    const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
    const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
    const sku = item.sku ? String(item.sku).trim() : '';

    const queryVariantId1 = numericVariantId || '__NONE__';
    const queryVariantId2 = gidVariantId || '__NONE__';
    const querySku = sku || '__NONE__';

    let unitCost = 0;
    const shopifyCost = costMap[variantId] || 0;

    const registry = registryLookupStmt.get(storeId, queryVariantId1, queryVariantId2, querySku, queryVariantId1, queryVariantId2, querySku);
    
    if (registry && (registry.landed_cost > 0 || registry.shopify_cost > 0)) {
      unitCost = registry.landed_cost || registry.shopify_cost || 0;
      
      if (shopifyCost > 0 && Math.abs(shopifyCost - unitCost) > (unitCost * 0.05)) {
        logAudit(storeId, 'WARN', `Cost Drift: ${item.name} registry cost is ${unitCost} but Shopify says ${shopifyCost}. Difference: ${Math.round(Math.abs(shopifyCost - unitCost))}`);
      }
    } else {
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

  const auditLogs = [];
  const isHealthy = await smokeTestShopify(shop_domain, access_token);
  if (!isHealthy) {
    const errorMsg = `🛑 [Sync Aborted] Shopify API unreachable or unauthorized.`;
    auditLogs.push({ id: 'API', status: 'FAILED', message: 'Connectivity check failed', details: shop_domain });
    console.error(errorMsg);
    if (onProgress) onProgress(errorMsg);
    logAudit(storeId, 'CRITICAL', errorMsg);
    return { added: 0, logs: auditLogs, failed: 1 };
  }

  const updateStatus = (status, progress, processed = 0, total = 0, currentOrder = '') => {
    try {
      db.prepare('UPDATE stores SET sync_status = ?, sync_progress = ?, sync_processed = ?, sync_total = ? WHERE id = ?')
        .run(status, progress, processed, total, storeId);
    } catch (e) { console.error('Status Error:', e.message); }
    if (onProgress) onProgress(status, progress, processed, total, currentOrder);
  };

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (
      store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
      address, city, price, tracking_number, items_count, notes, product_titles,
      delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date, confirmation_token, shipping_fee, discount_amount
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)
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

        const rawCity = addr.city || '';
        const { getCorrectedCity } = require('../../routes/cities');
        const cleanCity = getCorrectedCity(rawCity);
        
        const shopifyShipping = order.shipping_lines?.[0]?.price ? parseFloat(order.shipping_lines[0].price) : 0;
        const shopifyDiscount = parseFloat(order.current_total_discounts || order.total_discounts || 0);

        insertOrder.run(
          storeId, String(order.id), order.name,
          fullName,
          (order.created_at || '').split('T')[0],
          addr.phone || customer.phone || '',
          addressStr || '—',
          cleanCity,
          finalPrice, tracking, activeCount, order.note || '',
          productTitles,
          status,
          order.financial_status === 'paid' ? 'Paid' : 
          (order.financial_status === 'voided' ? 'Voided' : 'Pending'),
          0.5, courier, totalCost, source, token,
          shopifyShipping,
          shopifyDiscount
        );

        if (status === 'Pending' && (addr.phone || customer.phone)) {
          try {
            const settings = db.prepare('SELECT cod_verification_enabled FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
            if (settings.cod_verification_enabled !== 0) {
              const insertedOrder = db.prepare('SELECT id, phone, customer_name, ref_number FROM orders WHERE shopify_order_id = ? LIMIT 1').get(String(order.id));
              if (insertedOrder) {
                const { dispatchCODVerification } = require('../cod_verifier');
                const tenantId = require('../../tenant-context').getStore() || 'default';
                setImmediate(() => {
                  require('../../tenant-context').run(tenantId, () => {
                    dispatchCODVerification(insertedOrder).catch(err => console.error('Failed to dispatch auto COD verification:', err));
                  });
                });
              }
            }
          } catch (err) {
            console.error('Failed to trigger COD verification in batch sync:', err.message);
          }
        }

        count++;
      } catch (e) {
        auditLogs.push({ id: order.name || order.id, status: 'SKIPPED', message: e.message, details: 'Order Processing Error' });
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
    const dateMin = forceDeepSync ? '2010-01-01T00:00:00Z' : (sync_start_date ? new Date(sync_start_date).toISOString() : getDaysAgo(70));
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc&created_at_min=${dateMin}`;

    console.log(`🚀 [ShopifySync] Starting sync for ${shop_domain}`);
    console.log(`📅 [ShopifySync] Min Date: ${dateMin}, forceDeepSync: ${forceDeepSync}`);
    console.log(`🔗 [ShopifySync] Initial URL: ${nextUrl}`);

    const existingRows = db.prepare('SELECT shopify_order_id FROM orders WHERE store_id = ?').all(storeId);
    const existingIds = new Set(existingRows.map(r => String(r.shopify_order_id)));

    let totalAdded = 0;
    let totalScanned = 0;

    while (nextUrl) {
      if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
        console.log(`🛑 Shopify Fetch Sync aborted by user`);
        auditLogs.push({ id: 'SYSTEM', status: 'ABORTED', message: 'Sync stopped by user', details: `Added ${totalAdded}/${totalScanned}` });
        break;
      }

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
      
      const newlyFoundInBatch = batch.filter(o => !existingIds.has(String(o.id)));
      
      if (newlyFoundInBatch.length > 0) {
        const firstOrderName = newlyFoundInBatch[0]?.name || '';
        updateStatus('syncing', `Processing batch... ${totalScanned} scanned, ${totalAdded + newlyFoundInBatch.length} saved.`, totalAdded, totalAdded + 500, firstOrderName);

        const batchVariantIds = [...new Set(
          newlyFoundInBatch.flatMap(o => o.line_items.map(i => i.variant_id).filter(Boolean))
        )];

        const costMap = await getLiveShopifyCosts(
          shop_domain, access_token, batchVariantIds,
          (msg) => updateStatus('syncing', `Batch Progress: ${msg}`, totalAdded, totalAdded + 500, firstOrderName)
        );

        const added = insertChunk(newlyFoundInBatch.reverse(), costMap);
        totalAdded += added;
        
        newlyFoundInBatch.forEach(o => existingIds.add(String(o.id)));
        
        db.prepare("UPDATE stores SET last_synced_at = datetime('now') WHERE id = ?").run(storeId);
        console.log(`✅ [ShopifySync] Batch processed: ${added} added. Total so far: ${totalAdded}`);
      }

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
    return { added: totalAdded, logs: auditLogs, total: totalScanned, failed: auditLogs.length };
  } catch (err) {
    auditLogs.push({ id: 'CRITICAL', status: 'FAILED', message: err.message, details: 'Fatal Sync Error' });
    console.error(`Sync error for ${shop_domain}:`, err.message);
    updateStatus('error', `Sync failed: ${err.message}`);
    return { added: totalAdded || 0, logs: auditLogs, total: totalScanned || 0, failed: auditLogs.length };
  }
}

async function refreshShopifyUpdates(store, onProgress, options = {}) {
  const { id: storeId, shop_domain, access_token } = store;
  const updateStatus = (status, progress, processed = 0, total = 0, currentOrder = '') => {
    try {
      db.prepare('UPDATE stores SET sync_status = ?, sync_progress = ?, sync_processed = ?, sync_total = ? WHERE id = ?')
        .run(status, progress, processed, total, storeId);
    } catch (e) { console.error('Status Error:', e.message); }
    if (onProgress) onProgress(status, progress, processed, total, currentOrder);
  };

  if (!access_token || access_token === 'PENDING') return { updated: 0 };
  
  const syncStatus = options.syncStatus !== undefined ? options.syncStatus : true;
  const syncCosts = options.syncCosts !== undefined ? options.syncCosts : (options.forceDeepSync ? true : false);

  try {
    const storeDb = db.prepare('SELECT last_synced_at, sync_start_date FROM stores WHERE id = ?').get(storeId);
    let dateMin;
    if (options.forceDeepSync) {
      dateMin = storeDb?.sync_start_date ? storeDb.sync_start_date + 'T00:00:00Z' : getDaysAgo(730);
    } else if (storeDb?.last_synced_at) {
      const lastSyncedStr = storeDb.last_synced_at.includes('Z') ? storeDb.last_synced_at : storeDb.last_synced_at.replace(' ', 'T') + 'Z';
      const lastSynced = new Date(lastSyncedStr);
      const safetyBufferTime = new Date(lastSynced.getTime() - 15 * 60 * 1000);
      dateMin = safetyBufferTime.toISOString();
    } else {
      dateMin = getDaysAgo(60);
    }
    let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=updated_at+desc&updated_at_min=${dateMin}`;

    let updatedOrders = [];

    while (nextUrl) {
      if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
        console.log(`🛑 Shopify Refresh Sync aborted by user`);
        break;
      }

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

    const sheetOrders = db.prepare('SELECT id, shopify_order_id, delivery_status, tracking_number, cost, courier_fee, cost_locked, courier_fee_locked FROM orders WHERE store_id = ?').all(storeId);
    let costMap = {};
    const firstUpdateName = sheetOrders && sheetOrders[0] ? (shopifyMap[String(sheetOrders[0].shopify_order_id)]?.name || '') : '';
    if (syncCosts) {
      updateStatus('syncing', `Fetching costs for ${[...new Set(allVariantIds)].length} variants...`, 0, 0, firstUpdateName);
      costMap = await getLiveShopifyCosts(shop_domain, access_token, [...new Set(allVariantIds)], (msg) => {
        updateStatus('syncing', msg, 50, 100, firstUpdateName);
      });
    } else {
      updateStatus('syncing', 'Skipping costs (Status Only mode)...', 0, 0, firstUpdateName);
    }

    let count = 0;
    const updateStmt = db.prepare(`
      UPDATE orders SET 
        price = CASE WHEN is_cs_edited = 1 THEN price ELSE ? END,
        items_count = ?,
        notes = ?,
        product_titles = ?,
        payment_status = ?,
        cost = ?,
        tracking_number = ?,
        courier = ?,
        delivery_status = ?,
        shipping_fee = CASE WHEN is_cs_edited = 1 THEN shipping_fee ELSE ? END,
        discount_amount = CASE WHEN is_cs_edited = 1 THEN discount_amount ELSE ? END
      WHERE id = ?
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
            
            if (unitCost === 0) {
              const variantId = item.variant_id ? String(item.variant_id) : '';
              const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
              const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
              const sku = item.sku ? String(item.sku).trim() : '';

              const queryVariantId1 = numericVariantId || '__NONE__';
              const queryVariantId2 = gidVariantId || '__NONE__';
              const querySku = sku || '__NONE__';

              const registry = registryLookupStmt.get(storeId, queryVariantId1, queryVariantId2, querySku, queryVariantId1, queryVariantId2, querySku);
              
              if (registry) unitCost = registry.landed_cost || registry.shopify_cost || 0;
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
        } else if (mappedStatus === 'Cancelled' || mappedStatus === 'Voided' || mappedStatus === 'Returned' || mappedStatus === 'Delivered') {
          newDeliveryStatus = mappedStatus;
        } else if (fresh.fulfillment_status === 'fulfilled' && (newDeliveryStatus === 'Pending' || !newDeliveryStatus)) {
          newDeliveryStatus = 'Booked';
        }

        const oldTracking = row.tracking_number || '';
        const newTracking = tracking || '';
        if (oldTracking && newTracking && oldTracking !== newTracking) {
          const { logOrderChange } = require('../../db');
          logOrderChange({
            order_id: row.id,
            user_id: 0,
            type: 'TRACKING_UPDATE',
            old_val: { tracking_number: oldTracking },
            new_val: { tracking_number: newTracking }
          });
        }

        const shopifyShipping = fresh.shipping_lines?.[0]?.price ? parseFloat(fresh.shipping_lines[0].price) : 0;
        const shopifyDiscount = parseFloat(fresh.current_total_discounts || fresh.total_discounts || 0);

        updateStmt.run(
          finalPrice, activeCount, fresh.note || '',
          productTitles.join(', '),
          fresh.financial_status === 'paid' ? 'Paid' : (fresh.financial_status === 'voided' ? 'Voided' : 'Pending'),
          row.cost_locked ? row.cost : (totalCost > 0 ? totalCost : (row.cost || 0)),
          tracking, 
          row.courier_fee_locked ? row.courier_fee : courier, 
          newDeliveryStatus, 
          shopifyShipping,
          shopifyDiscount,
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
  
  if (order.return_status === 'returned' || order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') {
    return 'Returned';
  }
  
  if (order.fulfillment_status === 'fulfilled' && order.financial_status === 'paid') {
    return 'Delivered';
  }

  const fulfillments = (order.fulfillments || []).filter(f => f.status !== 'cancelled');
  const lastFul = fulfillments[fulfillments.length - 1];
  if (lastFul?.shipment_status === 'delivered') return 'Delivered';

  if (order.fulfillment_status === 'fulfilled') return 'Booked';
  return 'Pending';
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
    
    const existing = db.prepare('SELECT id, delivery_status, cost, courier_fee, cost_locked, tracking_number FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(storeId, String(shopifyOrderId));
    const dbStatus = (existing?.delivery_status || '').trim().toLowerCase();
    const isReturned = dbStatus === 'returned' || dbStatus === 'rto' || dbStatus === 'returned to origin';
    const isProtected = dbStatus === 'return received' || dbStatus === 'delivered';

    if (!isCancelled && !isReturned) {
      const { totalCost: tc, productTitles: titles, activeCount: count } = calculateOrderCost(storeId, order.line_items, costMap);
      totalCost = tc;
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
    } else if (mappedStatus === 'Cancelled' || mappedStatus === 'Voided' || mappedStatus === 'Returned' || mappedStatus === 'Delivered') {
      newDeliveryStatus = mappedStatus;
    } else if (order.fulfillment_status === 'fulfilled' && (newDeliveryStatus === 'Pending' || !newDeliveryStatus)) {
      newDeliveryStatus = 'Booked';
    }

    const vIds = order.line_items.map(li => li.variant_id);
    const imageMap = await fetchVariantImagesGraphQL(shop_domain, access_token, vIds);
    const lineItemsJson = JSON.stringify(order.line_items.map(li => {
      const qty = li.current_quantity !== undefined ? li.current_quantity : li.quantity;
      return {
        id: li.id,
        variant_id: li.variant_id,
        title: li.title,
        variant_title: li.variant_title,
        sku: li.sku,
        quantity: qty,
        price: li.price,
        image_url: imageMap[String(li.variant_id)] || null
      };
    }).filter(item => item.quantity > 0));

    if (existing) {
      const oldTracking = existing.tracking_number || '';
      const newTracking = tracking || '';
      if (oldTracking && newTracking && oldTracking !== newTracking) {
        const { logOrderChange } = require('../../db');
        logOrderChange({
          order_id: existing.id,
          user_id: 0,
          type: 'TRACKING_UPDATE',
          old_val: { tracking_number: oldTracking },
          new_val: { tracking_number: newTracking }
        });
      }

      const shopifyShipping = order.shipping_lines?.[0]?.price ? parseFloat(order.shipping_lines[0].price) : 0;
      const shopifyDiscount = parseFloat(order.current_total_discounts || order.total_discounts || 0);

      db.prepare(`
        UPDATE orders SET 
          price = CASE WHEN is_cs_edited = 1 THEN price ELSE ? END,
          items_count = ?,
          notes = ?,
          product_titles = ?,
          payment_status = ?,
          cost = ?,
          tracking_number = ?,
          courier = ?,
          delivery_status = ?, 
          line_items = ?,
          shipping_fee = CASE WHEN is_cs_edited = 1 THEN shipping_fee ELSE ? END,
          discount_amount = CASE WHEN is_cs_edited = 1 THEN discount_amount ELSE ? END,
          status_date = datetime('now')
        WHERE id = ?
      `).run(
        finalPrice, activeCount, order.note || '', productTitles,
        order.financial_status === 'paid' ? 'Paid' : (order.financial_status === 'voided' ? 'Voided' : 'Pending'),
        existing.cost_locked ? existing.cost : (totalCost > 0 ? totalCost : (existing.cost || 0)),
        tracking, courier, newDeliveryStatus, lineItemsJson, shopifyShipping, shopifyDiscount, existing.id
      );
      console.log(`⚡ [Hybrid Sync] Updated order ${shopifyOrderId}`);
      try { require('../../sse').broadcast('message', { type: 'order_updated', storeId, shopifyOrderId }); } catch(e) {}
    } else {
      const token = crypto.randomBytes(16).toString('hex');
      const fullName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || (customer.first_name || '');
      
      const rawCity = addr.city || '';
      const { getCorrectedCity } = require('../../routes/cities');
      const cleanCity = getCorrectedCity(rawCity);
      
      const shopifyShipping = order.shipping_lines?.[0]?.price ? parseFloat(order.shipping_lines[0].price) : 0;
      const shopifyDiscount = parseFloat(order.current_total_discounts || order.total_discounts || 0);

      db.prepare(`
        INSERT INTO orders (
          store_id, shopify_order_id, ref_number, customer_name, order_date, phone,
          address, city, price, tracking_number, items_count, notes, product_titles,
          line_items, delivery_status, payment_status, postex_weight, courier, cost, order_source, status_date, confirmation_token, tenant_id, shipping_fee, discount_amount
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?)
      `).run(
        storeId, String(order.id), order.name,
        fullName,
        (order.created_at || '').split('T')[0],
        addr.phone || customer.phone || '',
        `${addr.address1 || ''} ${cleanCity}`.trim(),
        cleanCity,
        finalPrice, tracking, activeCount, order.note || '', productTitles,
        lineItemsJson,
        newDeliveryStatus,
        order.financial_status === 'paid' ? 'Paid' : 'Pending',
        0.5, courier, totalCost, source, token,
        require('../../tenant-context').getStore() || 'default',
        shopifyShipping,
        shopifyDiscount
      );

      if (newDeliveryStatus === 'Pending' && (addr.phone || customer.phone)) {
        try {
          const settings = db.prepare('SELECT cod_verification_enabled FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
          if (settings.cod_verification_enabled !== 0) {
            const insertedOrder = db.prepare('SELECT id, phone, customer_name, ref_number FROM orders WHERE shopify_order_id = ? LIMIT 1').get(String(order.id));
            if (insertedOrder) {
              const { dispatchCODVerification } = require('../cod_verifier');
              const tenantId = require('../../tenant-context').getStore() || 'default';
              setImmediate(() => {
                require('../../tenant-context').run(tenantId, () => {
                  dispatchCODVerification(insertedOrder).catch(err => console.error('Failed to dispatch auto COD verification:', err));
                });
              });
            }
          }
        } catch (err) {
          console.error('Failed to trigger COD verification in single sync:', err.message);
        }
      }

      console.log(`⚡ [Hybrid Sync] Inserted new order ${shopifyOrderId}`);
      try { require('../../sse').broadcast('message', { type: 'order_updated', storeId, shopifyOrderId }); } catch(e) {}
    }
    return true;
  } catch (err) {
    console.error(`Hybrid Sync Error for ${shopifyOrderId}:`, err.message);
    return false;
  }
}

async function syncOrderByNumber(store, orderName) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return null;

  try {
    const searchUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?name=${encodeURIComponent(orderName)}&status=any`;
    const res = await fetch(searchUrl, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });
    const data = await res.json();
    const order = data.orders?.[0];
    if (!order) throw new Error(`Order ${orderName} not found in Shopify`);

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
      UPDATE orders SET 
        price = CASE WHEN is_cs_edited = 1 THEN price ELSE ? END,
        items_count = ?,
        notes = ?,
        product_titles = ?,
        payment_status = ?,
        tracking_number = ?,
        courier = ?,
        delivery_status = ?,
        shipping_fee = CASE WHEN is_cs_edited = 1 THEN shipping_fee ELSE ? END,
        discount_amount = CASE WHEN is_cs_edited = 1 THEN discount_amount ELSE ? END,
        status_date = datetime('now')
      WHERE shopify_order_id = ? AND store_id = ?
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
      const shopifyShipping = fresh.shipping_lines?.[0]?.price ? parseFloat(fresh.shipping_lines[0].price) : 0;
      const shopifyDiscount = parseFloat(fresh.current_total_discounts || fresh.total_discounts || 0);

      updateStmt.run(
        finalPrice, fresh.line_items.length, fresh.note || '',
        productTitles.join(', '),
        fresh.financial_status === 'paid' ? 'Paid' : (fresh.financial_status === 'voided' ? 'Voided' : 'Pending'),
        tracking, courier, newStatus,
        shopifyShipping, shopifyDiscount,
        String(fresh.id), store.id
      );
      updatedCount++;
    }
  } catch (e) {
    console.error('Bulk Specific Sync Error:', e.message);
  }
  return updatedCount;
}

async function editShopifyOrderGraphQL(store, shopifyOrderId, newLineItems, discountAmount, shippingFee) {
  const { shop_domain, access_token } = store;
  const graphqlUrl = `https://${shop_domain}/admin/api/2024-10/graphql.json`;
  
  const headers = {
    'X-Shopify-Access-Token': access_token,
    'Content-Type': 'application/json'
  };

  const runQuery = async (query, variables = {}) => {
    const res = await fetch(graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      throw new Error(`Shopify GraphQL error: ${res.statusText} (${res.status})`);
    }
    const data = await res.json();
    if (data.errors) {
      throw new Error(`Shopify GraphQL errors: ${data.errors.map(e => e.message).join(', ')}`);
    }
    return data.data;
  };

  // Ensure Shopify GID formats
  const orderGid = shopifyOrderId.startsWith('gid://') ? shopifyOrderId : `gid://shopify/Order/${shopifyOrderId}`;

  // 1. Begin Order Edit
  console.log(`[OrderEdit] Beginning edit session for order ${orderGid}`);
  const beginMutation = `
    mutation orderEditBegin($id: ID!) {
      orderEditBegin(id: $id) {
        calculatedOrder {
          id
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                variant {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const beginRes = await runQuery(beginMutation, { id: orderGid });
  const beginData = beginRes.orderEditBegin;
  if (beginData.userErrors?.length) {
    throw new Error(`orderEditBegin user error: ${beginData.userErrors.map(u => u.message).join(', ')}`);
  }

  const calculatedOrder = beginData.calculatedOrder;
  const calculatedOrderId = calculatedOrder.id;
  
  // Create a map of existing calculated line items by variant ID for easy comparison
  const existingItems = calculatedOrder.lineItems.edges.map(e => ({
    calculatedLineItemId: e.node.id,
    quantity: e.node.quantity,
    variantId: e.node.variant?.id ? e.node.variant.id.split('/').pop() : null
  })).filter(item => item.variantId && item.quantity > 0);

  console.log(`[OrderEdit] Found ${existingItems.length} existing line items in edit session`);

  let changeCount = 0;

  // Query existing discount applications on the order
  let existingDiscountIds = [];
  try {
    const getDiscountsQuery = `
      query getOrderDiscounts($id: ID!) {
        order(id: $id) {
          discountApplications(first: 50) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;
    const discountsRes = await runQuery(getDiscountsQuery, { id: orderGid });
    existingDiscountIds = discountsRes.order?.discountApplications?.edges?.map(e => e.node.id) || [];
  } catch (discountsErr) {
    console.warn(`[OrderEdit] Warning fetching existing discounts:`, discountsErr.message);
  }

  // Remove existing manual discounts if we want to change or clear them
  if (existingDiscountIds.length > 0) {
    for (const discountId of existingDiscountIds) {
      changeCount++;
      console.log(`[OrderEdit] Removing existing discount application: ${discountId}`);
      const removeDiscountMutation = `
        mutation orderEditRemoveDiscount($id: ID!, $discountApplicationId: ID!) {
          orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
            userErrors { message }
          }
        }
      `;
      const removeDiscountRes = await runQuery(removeDiscountMutation, {
        id: calculatedOrderId,
        discountApplicationId: discountId
      });
      if (removeDiscountRes.orderEditRemoveDiscount?.userErrors?.length) {
        console.warn(`[OrderEdit] Warning removing discount ${discountId}:`, removeDiscountRes.orderEditRemoveDiscount.userErrors.map(u => u.message).join(', '));
      }
    }
  }

  // 2. Process Line Items: Add, Remove, or Update Quantities
  const targetItems = newLineItems.map(item => {
    const rawId = String(item.variant_id || '');
    const numId = rawId.includes('/') ? rawId.split('/').pop() : rawId;
    return {
      variantId: numId,
      quantity: parseInt(item.quantity) || 0
    };
  }).filter(item => item.variantId);

  const activeLineItems = [];

  // A. Determine items to update or remove
  for (const existing of existingItems) {
    const target = targetItems.find(t => t.variantId === existing.variantId);
    if (!target || target.quantity === 0) {
      changeCount++;
      // Remove item by setting quantity to 0
      console.log(`[OrderEdit] Removing line item: calculated ID ${existing.calculatedLineItemId}`);
      const setQtyMutation = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            userErrors { message }
          }
        }
      `;
      const removeRes = await runQuery(setQtyMutation, { id: calculatedOrderId, lineItemId: existing.calculatedLineItemId, quantity: 0 });
      if (removeRes.orderEditSetQuantity?.userErrors?.length) {
        throw new Error(`orderEditSetQuantity (remove) error: ${removeRes.orderEditSetQuantity.userErrors.map(u => u.message).join(', ')}`);
      }
    } else if (target.quantity !== existing.quantity) {
      changeCount++;
      // Update quantity
      console.log(`[OrderEdit] Updating line item quantity: calculated ID ${existing.calculatedLineItemId} to ${target.quantity}`);
      const setQtyMutation = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            userErrors { message }
          }
        }
      `;
      const qtyRes = await runQuery(setQtyMutation, { id: calculatedOrderId, lineItemId: existing.calculatedLineItemId, quantity: target.quantity });
      if (qtyRes.orderEditSetQuantity?.userErrors?.length) {
        throw new Error(`orderEditSetQuantity error: ${qtyRes.orderEditSetQuantity.userErrors.map(u => u.message).join(', ')}`);
      }
      activeLineItems.push({ calculatedLineItemId: existing.calculatedLineItemId });
    } else {
      activeLineItems.push({ calculatedLineItemId: existing.calculatedLineItemId });
    }
  }

  // B. Determine new items to add
  for (const target of targetItems) {
    const exists = existingItems.some(e => e.variantId === target.variantId);
    if (!exists && target.quantity > 0) {
      changeCount++;
      const variantGid = `gid://shopify/ProductVariant/${target.variantId}`;
      console.log(`[OrderEdit] Adding new variant: ${variantGid} with quantity ${target.quantity}`);
      const addMutation = `
        mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedLineItem {
              id
            }
            userErrors { message }
          }
        }
      `;
      const addRes = await runQuery(addMutation, { id: calculatedOrderId, variantId: variantGid, quantity: target.quantity });
      if (addRes.orderEditAddVariant?.userErrors?.length) {
        throw new Error(`orderEditAddVariant error: ${addRes.orderEditAddVariant.userErrors.map(u => u.message).join(', ')}`);
      }
      if (addRes.orderEditAddVariant?.calculatedLineItem?.id) {
        activeLineItems.push({ calculatedLineItemId: addRes.orderEditAddVariant.calculatedLineItem.id });
      }
    }
  }

  // 3. Set Custom Discount
  if (discountAmount > 0 && activeLineItems.length > 0) {
    const N = activeLineItems.length;
    const discountPerLine = Math.floor(discountAmount / N);

    for (let i = 0; i < N; i++) {
      const lineItem = activeLineItems[i];
      let lineDiscount = discountPerLine;
      if (i === N - 1) {
        // Last item gets the remainder
        lineDiscount = discountAmount - (discountPerLine * (N - 1));
      }

      if (lineDiscount > 0) {
        changeCount++;
        console.log(`[OrderEdit] Applying discount of Rs ${lineDiscount} to line item ${lineItem.calculatedLineItemId}`);
        const discountMutation = `
          mutation orderEditAddLineItemDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
            orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
              userErrors { message }
            }
          }
        `;
        const discountRes = await runQuery(discountMutation, {
          id: calculatedOrderId,
          lineItemId: lineItem.calculatedLineItemId,
          discount: {
            fixedValue: {
              amount: Number(lineDiscount).toFixed(2),
              currencyCode: "PKR"
            },
            description: "CS Discount"
          }
        });
        if (discountRes.orderEditAddLineItemDiscount?.userErrors?.length) {
          console.warn(`[OrderEdit] Discount mutation warning for line ${lineItem.calculatedLineItemId}:`, discountRes.orderEditAddLineItemDiscount.userErrors.map(u => u.message).join(', '));
        }
      }
    }
  } else if (discountAmount > 0) {
    console.warn(`[OrderEdit] Could not find any active line item to apply the discount of Rs ${discountAmount} to.`);
  }

  // Shipping edits are not supported in standard Shopify GraphQL Order Edit APIs without Plus, so we skip it to prevent crashes. The new total is logged in Shopify timeline notes.

  if (changeCount === 0) {
    console.log(`[OrderEdit] No line items or discount changes detected. Skipping Shopify commit.`);
    return true;
  }

  // 5. Commit Order Edit
  console.log(`[OrderEdit] Committing edit session: ${calculatedOrderId}`);
  const commitMutation = `
    mutation orderEditCommit($id: ID!) {
      orderEditCommit(id: $id) {
        order {
          id
        }
        userErrors {
          message
        }
      }
    }
  `;
  const commitRes = await runQuery(commitMutation, { id: calculatedOrderId });
  const commitData = commitRes.orderEditCommit;
  if (commitData.userErrors?.length) {
    throw new Error(`orderEditCommit user error: ${commitData.userErrors.map(u => u.message).join(', ')}`);
  }

  console.log(`[OrderEdit] Successfully committed edit for Shopify Order ${shopifyOrderId}`);
  return true;
}

module.exports = {
  fetchShopifyOrders,
  refreshShopifyUpdates,
  syncSingleShopifyOrder,
  syncOrderByNumber,
  syncSpecificOrders,
  mapShopifyStatus,
  editShopifyOrderGraphQL
};
