const fetch = require('node-fetch');

async function listProducts() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';

  const query = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    
    const data = await res.json();
    console.log(JSON.stringify(data.data.products.edges.map(e => e.node), null, 2));
  } catch (err) {
    console.error("Error calling Shopify API:", err);
  }
}

listProducts();
