const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function shopifyGql(query, variables = {}) {
  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

async function checkMetafields() {
  // Texture Light Sky product ID is 8292197269763
  const query = `
    query {
      product(id: "gid://shopify/Product/8292197269763") {
        title
        metafield(namespace: "custom", key: "linked_color_products") {
          value
          type
        }
      }
    }
  `;
  try {
    const res = await shopifyGql(query);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

checkMetafields();
