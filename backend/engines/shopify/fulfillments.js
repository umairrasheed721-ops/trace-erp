const fetch = require('../fetch');
const API_TIMEOUT = 15000;

async function registerShopifyWebhooks(store, appUrl) {
  const { shop_domain, access_token } = store;
  if (!access_token || access_token === 'PENDING') throw new Error('No valid token');
  
  const topics = ['orders/create', 'orders/updated', 'orders/cancelled'];
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

module.exports = {
  registerShopifyWebhooks,
  fulfillShopifyOrder,
  updateShopifyAddress
};
