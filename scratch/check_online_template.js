const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function checkProductTemplate() {
  const query = `
    {
      products(first: 5, query: "title:'Multi ref Pro-active'") {
        edges {
          node {
            id
            title
            handle
            templateSuffix
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    const json = await res.json();
    console.log('Template Result:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

checkProductTemplate();
