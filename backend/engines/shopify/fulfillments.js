const fetch = require('../fetch');
const API_TIMEOUT = 15000;

async function registerShopifyWebhooks(store, appUrl) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');
  
  const topics = [
    'orders/create',
    'orders/updated',
    'orders/fulfilled',
    'orders/paid',
    'orders/cancelled',
    'fulfillments/create',
    'fulfillments/update',
    'products/create',
    'products/update',
    'products/delete',
  ];
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
    
    if (res.ok || res.status === 422) successCount++;
  }
  
  return successCount === topics.length;
}

async function fulfillShopifyOrder(store, shopifyOrderId, trackingNumber, courierName) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');

  const foUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillment_orders.json`;
  const foRes = await fetch(foUrl, { headers: { 'X-Shopify-Access-Token': access_token }, timeout: API_TIMEOUT });
  const foData = await foRes.json();
  
  if (!foData.fulfillment_orders || !foData.fulfillment_orders.length) {
     throw new Error('No fulfillable orders found in Shopify');
  }

  const openFO = foData.fulfillment_orders.find(fo => fo.status === 'open') || foData.fulfillment_orders[0];
  const fulfillmentOrderId = openFO.id;

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
        url: courierName === 'PostEx' ? `https://postex.pk/tracking?cn=${trackingNumber}` : ''
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
      },
      billing_address: {
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

async function cancelShopifyFulfillment(store, shopifyOrderId) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');

  try {
    // 1. Get all fulfillments for this order
    const fUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillments.json`;
    const res = await fetch(fUrl, {
      headers: { 'X-Shopify-Access-Token': access_token },
      timeout: API_TIMEOUT
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`⚠️ [ShopifyFulfillmentCancel] Failed to get fulfillments for order ${shopifyOrderId}: ${errText}`);
      return false;
    }

    const data = await res.json();
    const fulfillments = data.fulfillments || [];

    // Filter out already cancelled fulfillments
    const activeFulfillments = fulfillments.filter(f => f.status !== 'cancelled');
    if (activeFulfillments.length === 0) {
      console.log(`ℹ️ [ShopifyFulfillmentCancel] No active fulfillments to cancel for order ${shopifyOrderId}`);
      return true;
    }

    // 2. Cancel each active fulfillment
    for (const f of activeFulfillments) {
      const cancelUrl = `https://${shop_domain}/admin/api/2024-10/fulfillments/${f.id}/cancel.json`;
      console.log(`📦 [ShopifyFulfillmentCancel] Cancelling fulfillment ${f.id} for order ${shopifyOrderId}`);
      const cancelRes = await fetch(cancelUrl, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': access_token,
          'Content-Type': 'application/json'
        },
        timeout: API_TIMEOUT
      });

      if (!cancelRes.ok) {
        const errText = await cancelRes.text();
        console.error(`⚠️ [ShopifyFulfillmentCancel] Failed to cancel fulfillment ${f.id} on Shopify: ${errText}`);
        throw new Error(`Shopify rejected cancel for fulfillment ${f.id}: ${errText}`);
      } else {
        console.log(`✅ [ShopifyFulfillmentCancel] Successfully cancelled fulfillment ${f.id} on Shopify`);
      }
    }
    return true;
  } catch (err) {
    console.error(`❌ [ShopifyFulfillmentCancel] Error:`, err.message);
    throw err;
  }
}

const READY_TO_BOOK_TAG = 'Ready to Book';
const TAG_API_TIMEOUT = 5000;

function mergeOrderTagString(existingTags, tagName = READY_TO_BOOK_TAG, mode = 'add') {
  const targetLower = String(tagName || '').trim().toLowerCase();
  const list = String(existingTags || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const filtered = list.filter(t => t.toLowerCase() !== targetLower);
  if (mode === 'add' && targetLower) {
    filtered.push(tagName);
  }
  const next = filtered.join(', ');
  const prevNormalized = list.join(', ');
  return { tags: next, changed: next.toLowerCase() !== prevNormalized.toLowerCase() };
}

async function updateShopifyOrderTag(store, shopifyOrderId, tagName = READY_TO_BOOK_TAG, mode = 'add', options = {}) {
  const { shop_domain, access_token } = store || {};
  if (!shop_domain || !access_token || access_token === 'PENDING' || !shopifyOrderId) {
    return { ok: false, skipped: true, error: 'Missing store token or shopify_order_id' };
  }

  const checkFulfilled = Boolean(options?.onlyIfFulfilledOrCancelled) && mode === 'remove';

  try {
    // 1. Fetch live tags (and fulfillment/cancel state when guarded) so we NEVER overwrite tags or strip unfulfilled orders
    const fields = checkFulfilled ? 'id,tags,fulfillment_status,cancelled_at,financial_status,fulfillments' : 'id,tags';
    const getUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}.json?fields=${fields}`;
    const getRes = await fetch(getUrl, {
      headers: { 'X-Shopify-Access-Token': access_token },
      timeout: TAG_API_TIMEOUT,
    });
    if (!getRes.ok) {
      return { ok: false, error: `Shopify GET tags HTTP ${getRes.status}` };
    }
    const getData = await getRes.json();
    const orderObj = getData?.order || {};
    const currentTags = orderObj.tags || '';

    if (checkFulfilled) {
      const activeFulfillments = (orderObj.fulfillments || []).filter(f => String(f?.status || '').toLowerCase() !== 'cancelled');
      const fulStatus = String(orderObj.fulfillment_status || '').toLowerCase();
      const isFulfilled = fulStatus === 'fulfilled' || fulStatus === 'partial' || activeFulfillments.length > 0;
      const isCancelled = Boolean(orderObj.cancelled_at) || String(orderObj.financial_status || '').toLowerCase() === 'voided';
      if (!isFulfilled && !isCancelled) {
        return { ok: true, changed: false, blockedUnfulfilled: true, tags: currentTags };
      }
    }

    const { tags: nextTags, changed } = mergeOrderTagString(currentTags, tagName, mode);

    if (!changed) {
      return { ok: true, changed: false, tags: nextTags };
    }

    // 2. PUT merged tags back to Shopify
    const putUrl = `https://${shop_domain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json',
      },
      timeout: TAG_API_TIMEOUT,
      body: JSON.stringify({ order: { id: Number(shopifyOrderId) || shopifyOrderId, tags: nextTags } }),
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      return { ok: false, error: `Shopify PUT tags HTTP ${putRes.status}: ${errText.slice(0, 120)}` };
    }
    return { ok: true, changed: true, tags: nextTags };
  } catch (err) {
    console.warn(`⚠️ [ShopifyTagSync] Failed (${mode} "${tagName}") on order ${shopifyOrderId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  registerShopifyWebhooks,
  fulfillShopifyOrder,
  updateShopifyAddress,
  cancelShopifyFulfillment,
  READY_TO_BOOK_TAG,
  mergeOrderTagString,
  updateShopifyOrderTag,
};
