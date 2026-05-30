const { instaworldFetch } = require('./instaworld_http');
const { instaworldBreaker } = require('./circuit_breaker');

/**
 * Creates a booking in Instaworld (Supports TCS, LCS, etc.)
 */
async function createInstaworldOrder(store, order, courierName = 'TCS') {
  return instaworldBreaker.execute(async () => {
    const { instaworld_key } = store;
    if (!instaworld_key) throw new Error('Instaworld API Key missing');

    // URL for one-be production
    const url = 'https://one-be.instaworld.pk/logistics/v1/bookOrder';

    const payload = {
      shipper_name: store.store_name || store.shop_domain,
      consignee_name: order.customer_name,
      consignee_phone: order.phone,
      consignee_address: order.address,
      consignee_city: (order.city || '').trim(),
      order_id: order.ref_number || String(order.shopify_order_id),
      cod_amount: parseFloat(order.price) || 0,
      weight: order.postex_weight || 0.5,
      pieces: order.items_count || 1,
      description: order.product_titles || 'General Items',
      courier_name: courierName, // e.g. "TCS", "LCS", "Leopards"
      service_type: 'Overnight'
    };

    const response = await instaworldFetch(url, {
      method: 'POST',
      headers: {
        'api-key': instaworld_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      proxyUrl: store.gas_proxy_url,
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Instaworld Booking Failed');
    }

    return data.tracking_number;
  });
}

/**
 * Cancel a booking in Instaworld
 */
async function cancelInstaworldOrder(store, trackingNumber) {
  return instaworldBreaker.execute(async () => {
    const { instaworld_key } = store;
    if (!instaworld_key) throw new Error('Instaworld API Key missing');

    const url = 'https://one-be.instaworld.pk/logistics/v1/cancelOrder';
    const response = await instaworldFetch(url, {
      method: 'POST',
      headers: {
        'api-key': instaworld_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tracking_number: trackingNumber }),
      proxyUrl: store.gas_proxy_url,
    });

    const data = await response.json();
    return data.success;
  });
}

/**
 * Fetch official Instaworld city list
 */
async function fetchInstaworldCities(token, store = null) {
  return instaworldBreaker.execute(async () => {
    const url = 'https://one-be.instaworld.pk/logistics/v1/getCities';
    const response = await instaworldFetch(url, {
      method: 'GET',
      headers: { 'api-key': token },
      proxyUrl: store && store.gas_proxy_url,
    });
    const data = await response.json();
    return data.cities || [];
  });
}

module.exports = { createInstaworldOrder, cancelInstaworldOrder, fetchInstaworldCities };
