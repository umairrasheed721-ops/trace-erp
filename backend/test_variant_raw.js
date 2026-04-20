const fetch = require('node-fetch');

async function test() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';
  const variantId = '47810150039811';

  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/variants/${variantId}.json`, {
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
