const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const productId = '9161752903939';

async function main() {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`;
  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });
    console.log(JSON.stringify(res.data.product, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
