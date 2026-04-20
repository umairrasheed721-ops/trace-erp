const fetch = require('node-fetch');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { getLiveShopifyCosts } = require('../engines/shopify');

router.get('/check-costs/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Get 5 recent orders that have variants
  const orders = db.prepare('SELECT shopify_order_id, product_titles FROM orders WHERE store_id = ? ORDER BY id DESC LIMIT 5').all(storeId);
  
  // We need to fetch the order from Shopify to get variant IDs since we don't store them individually in our DB
  const shopDomain = store.shop_domain;
  const accessToken = store.access_token;

  try {
    const results = [];
    for (const order of orders) {
      const sRes = await fetch(`https://${shopDomain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      const sData = await sRes.json();
      const variantIds = (sData.order.line_items || []).map(i => i.variant_id).filter(Boolean);
      
      const costMap = await getLiveShopifyCosts(shopDomain, accessToken, variantIds);
      
      results.push({
        order_name: sData.order.name,
        variant_ids: variantIds,
        cost_map: costMap
      });
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
