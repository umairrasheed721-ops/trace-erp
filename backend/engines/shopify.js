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

async function fetchShopifyOrders(store, onProgress) {
  const { id: storeId, shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return { added: 0 };

  const dateMin = getDaysAgo(70);
  let nextUrl = `https://${shop_domain}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc&created_at_min=${dateMin}`;

  // Get existing IDs as a Set for fast O(1) lookup
  const existingRows = db.prepare('SELECT shopify_order_id FROM orders WHERE store_id = ?').all(storeId);
  const existingIds = new Set(existingRows.map(r => String(r.shopify_order_id)));

  let newOrdersFound = [];
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

    if (onProgress) onProgress('Fetching Shopify (New Orders)', newOrdersFound.length + batch.length, 0);

    for (const order of batch) {
      if (existingIds.has(String(order.id))) { keepFetching = false; break; }
      newOrdersFound.push(order);
    }

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = keepFetching && nextMatch ? nextMatch[1] : null;
  }

  if (!newOrdersFound.length) return { added: 0 };

  // Collect all variant IDs for cost lookup
  const allVariantIds = [...new Set(
    newOrdersFound.flatMap(o => o.line_items.map(i => i.variant_id).filter(Boolean))
  )];
  const costMap = await getLiveShopifyCosts(shop_domain, access_token, allVariantIds);

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

  const added = insertMany(newOrdersFound.reverse());

  // Update last synced time
  db.prepare("UPDATE stores SET last_synced_at = datetime('now') WHERE id = ?").run(storeId);

  console.log(`✅ Shopify Fetch [${shop_domain}]: Added ${added} new orders`);
  return { added };
}

async function refreshShopifyUpdates(store, onProgress) {
  const { id: storeId, shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') return { updated: 0 };

  const dateMin = getDaysAgo(7);
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
    if (onProgress) onProgress('Refreshing Shopify Updates', updatedOrders.length, 0);

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  if (!updatedOrders.length) return { updated: 0 };

  const shopifyMap = {};
  const allVariantIds = [];
  updatedOrders.forEach(o => {
    shopifyMap[String(o.id)] = o;
    o.line_items.forEach(i => { if (i.variant_id) allVariantIds.push(i.variant_id); });
  });

  const costMap = await getLiveShopifyCosts(shop_domain, access_token, [...new Set(allVariantIds)]);

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

      fresh.line_items.forEach(item => {
        const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
        if (qty === 0) return;
        totalCost += (costMap[String(item.variant_id)] || 0) * qty;
        productTitles.push(`${item.name} (x${qty})`);
      });

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
  return { updated: count };
}

async function getLiveShopifyCosts(shopDomain, accessToken, variantIds) {
  const costMap = {};
  if (!variantIds || !variantIds.length) return costMap;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < variantIds.length; i += CHUNK_SIZE) {
    const chunk = variantIds.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2024-10/variants.json?ids=${chunk.join(',')}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const data = await res.json();
      (data.variants || []).forEach(v => { costMap[String(v.id)] = parseFloat(v.cost || 0); });
    } catch (e) {}
    await sleep(500);
  }
  return costMap;
}

module.exports = { fetchShopifyOrders, refreshShopifyUpdates };
