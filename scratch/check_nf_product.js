const axios = require('axios');

async function main() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';
  const query = 'N_F Branded';
  const url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=50`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    console.log('Products found (filtered):');
    for (const p of res.data.products) {
      if (p.title.toLowerCase().includes('n_f') || p.title.toLowerCase().includes('north')) {
        console.log(JSON.stringify(p, null, 2));
      }
    }
  } catch (err) {
    console.error('Error finding product:', err.response ? err.response.data : err.message);
  }
}

main();
