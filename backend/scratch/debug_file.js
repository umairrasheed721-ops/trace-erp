const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const fileId = 'gid://shopify/MediaImage/43195927855363';

async function testQuery() {
  const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          status
          image {
            url
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
    body: JSON.stringify({ query, variables: { id: fileId } })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testQuery();
