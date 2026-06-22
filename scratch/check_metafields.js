const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const productId = 8292197695747; // TEXTURE BLACK

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log(`Fetching metafields for product ${productId}...`);
    // Use the metafields endpoint
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products/${productId}/metafields.json`,
      { headers }
    );
    console.log('Metafields found:', JSON.stringify(res.data.metafields, null, 2));

    // Also let's check product images or files if they have any size charts in their media
    const prodRes = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`,
      { headers }
    );
    console.log('Product Images:', JSON.stringify(prodRes.data.product.images, null, 2));

  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

main();
