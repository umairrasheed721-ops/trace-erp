const fetch = require('node-fetch');

async function test() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';
  const inventoryItemId = '49899271258371';

  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/inventory_items/${inventoryItemId}.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  if (!res.ok) {
    console.error(`Error: ${res.status} ${await res.text()}`);
    return;
  }
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
