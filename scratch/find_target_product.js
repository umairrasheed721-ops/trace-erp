const axios = require('axios');

async function main() {
  const shopDomain = 'tracepk.com';
  const accessToken = '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';
  const query = 'pro-active';
  const url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=50`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    console.log('All Products:');
    for (const p of res.data.products) {
      console.log(`- ID: ${p.id}, Title: "${p.title}", Handle: "${p.handle}"`);
    }
  } catch (err) {
    console.error('Error finding product:', err.response ? err.response.data : err.message);
  }
}

main();
