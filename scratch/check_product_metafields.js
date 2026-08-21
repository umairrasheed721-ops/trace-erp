const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function checkProductMetafields() {
  const query = `
    {
      products(first: 10) {
        edges {
          node {
            id
            title
            handle
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                  reference {
                    ... on GenericFile {
                      id
                      url
                    }
                    ... on MediaImage {
                      id
                      image {
                        url
                      }
                    }
                    ... on Video {
                      id
                      sources {
                        url
                        mimeType
                        format
                      }
                    }
                  }
                }
              }
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
    console.log('GraphQL Result:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

checkProductMetafields();
