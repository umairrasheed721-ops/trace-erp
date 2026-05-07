const db = require('../backend/db');
const { getShopifyOrderStatus } = require('../backend/engines/shopify_finance');

(async () => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  const status = await getShopifyOrderStatus(store, '6916067819779');
  console.log('6916067819779:', status);
  
  const status2 = await getShopifyOrderStatus(store, '6977661239555');
  console.log('6977661239555:', status2);
})();
