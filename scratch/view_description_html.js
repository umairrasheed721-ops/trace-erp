const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

const targetIds = [8285438378243, 8629309505795];

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    for (const id of targetIds) {
      console.log(`=== Fetching Product ID ${id} ===`);
      const res = await axios.get(
        `https://${shopDomain}/admin/api/2024-10/products/${id}.json`,
        { headers }
      );
      console.log(`Title: ${res.data.product.title}`);
      console.log('HTML Description:\n', res.data.product.body_html);
      console.log('\n---------------------------------------\n');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
