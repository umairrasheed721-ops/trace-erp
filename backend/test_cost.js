const fetch = require('node-fetch');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHUNK_SIZE = 50;

async function getLiveShopifyCosts(shopDomain, accessToken, variantIds) {
  const costMap = {};
  if (!variantIds || !variantIds.length) return costMap;

  const variantToInventoryItem = {};
  const inventoryItemIds = new Set();

  for (let i = 0; i < variantIds.length; i += CHUNK_SIZE) {
    const chunk = variantIds.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2024-10/variants.json?ids=${chunk.join(',')}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const data = await res.json();
      (data.variants || []).forEach(v => {
        if (v.inventory_item_id) {
          variantToInventoryItem[String(v.id)] = String(v.inventory_item_id);
          inventoryItemIds.add(String(v.inventory_item_id));
        }
      });
    } catch (e) {
      console.error('Error variants:', e.message);
    }
    await sleep(500);
  }

  if (inventoryItemIds.size === 0) return costMap;

  const inventoryItemIdsArray = Array.from(inventoryItemIds);
  const inventoryItemToCost = {};

  for (let i = 0; i < inventoryItemIdsArray.length; i += CHUNK_SIZE) {
    const chunk = inventoryItemIdsArray.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2024-10/inventory_items.json?ids=${chunk.join(',')}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const data = await res.json();
      (data.inventory_items || []).forEach(item => {
        inventoryItemToCost[String(item.id)] = parseFloat(item.cost || 0);
      });
    } catch (e) {
      console.error('Error inventory:', e.message);
    }
    await sleep(500);
  }

  Object.keys(variantToInventoryItem).forEach(vId => {
    const iiId = variantToInventoryItem[vId];
    costMap[vId] = inventoryItemToCost[iiId] || 0;
  });

  return costMap;
}

const DOMAIN = '041839-3.myshopify.com';
const TOKEN = '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';
const VARIANTS = ['44537445777667']; // This is a variant ID from earlier

getLiveShopifyCosts(DOMAIN, TOKEN, VARIANTS).then(map => {
  console.log('Result:', map);
});
