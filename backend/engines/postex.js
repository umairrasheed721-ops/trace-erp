const fetch = require('node-fetch');

/**
 * Creates a real booking in PostEx
 */
async function createPostExOrder(store, order) {
  const { postex_token } = store;
  if (!postex_token) throw new Error('PostEx Token missing for this store');

  const url = 'https://api.postex.pk/services/integration/api/order/v1/create-order';

  // Basic City Mapping (Simple for now, can be expanded)
  const city = (order.city || '').trim();

  const payload = {
    customerName: order.customer_name,
    customerPhone: order.phone,
    address: order.address,
    cityName: city,
    orderDetail: order.product_titles || 'General Items',
    orderRefNumber: order.ref_number || String(order.shopify_order_id),
    orderAmount: parseFloat(order.price) || 0,
    orderType: 'COD', // Default to Cash on Delivery
    itemsCount: order.items_count || 1,
    weight: order.postex_weight || 0.5
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': postex_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (data.statusCode !== '200') {
    throw new Error(data.statusMessage || 'PostEx Booking Failed');
  }

  // PostEx usually returns trackingNumber in dist.trackingNumber or similar
  return data.dist?.trackingNumber || data.dist;
}

/**
 * Fetch official PostEx city list for mapping
 */
async function fetchPostExCities(token) {
  const url = 'https://api.postex.pk/services/integration/api/order/v1/get-cities';
  const response = await fetch(url, {
    headers: { 'token': token }
  });
  const data = await response.json();
  return data.dist || []; // Returns array of city names
}

module.exports = { createPostExOrder, fetchPostExCities };
