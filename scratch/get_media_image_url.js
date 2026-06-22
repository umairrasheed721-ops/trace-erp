const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

const query = `
query {
  node(id: "gid://shopify/MediaImage/43195927855363") {
    ... on MediaImage {
      image {
        url
      }
    }
  }
}
`;

async function main() {
  const url = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
  try {
    const res = await axios.post(url, { query }, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
