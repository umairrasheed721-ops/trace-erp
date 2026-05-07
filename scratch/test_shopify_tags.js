const db = require('../backend/db');
const { shopifyFetch } = require('../backend/engines/shopify'); // or similar
const fetch = require('node-fetch');

(async () => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  
  const res = await fetch(`https://${store.shop_domain}/admin/api/2024-10/orders/6916067819779.json?fields=id,tags,note`, {
    headers: { 'X-Shopify-Access-Token': store.access_token }
  });
  const data = await res.json();
  console.log('6916067819779:', data.order);
})();
