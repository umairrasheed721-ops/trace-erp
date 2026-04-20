const fetch = require('node-fetch');

async function test() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';
  const variantId = '47810150039811';
  
  const query = `
    query {
      node(id: "gid://shopify/ProductVariant/${variantId}") {
        ... on ProductVariant {
          id
          inventoryItem {
            id
          }
        }
      }
    }
  `;

  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
