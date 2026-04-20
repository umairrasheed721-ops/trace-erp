const express = require('express');
const router = express.Router();
const db = require('../db');
const { getLiveShopifyCosts } = require('../engines/shopify');
const fetch = require('node-fetch');

router.get('/test-cost/:orderId', async (req, res) => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  if (!store) return res.status(404).json({ error: 'No store' });
  
  try {
    const oRes = await fetch(\`https://\${store.shop_domain}/admin/api/2024-10/orders/\${req.params.orderId}.json\`, {
      headers: { 'X-Shopify-Access-Token': store.access_token }
    });
    const oData = await oRes.json();
    const order = oData.order;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const vIds = order.line_items.map(i => i.variant_id).filter(Boolean);
    const costMap = await getLiveShopifyCosts(store.shop_domain, store.access_token, vIds);
    
    let totalCost = 0;
    order.line_items.forEach(item => {
      const cost = costMap[String(item.variant_id)] || 0;
      totalCost += cost * item.quantity;
    });
    
    res.json({ orderName: order.name, vIds, costMap, totalCost });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
