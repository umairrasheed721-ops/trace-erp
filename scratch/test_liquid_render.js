const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function fetchProductFullMetafields() {
  const query = `
    {
      product(id: "gid://shopify/Product/8307671302403") {
        id
        title
        handle
        product_video: metafield(namespace: "custom", key: "product_video") {
          namespace
          key
          value
          type
          reference {
            __typename
            ... on Video {
              id
              sources {
                url
                mimeType
                format
              }
            }
            ... on GenericFile {
              id
              url
            }
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
    console.log('Product Metafield Data:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchProductFullMetafields();
