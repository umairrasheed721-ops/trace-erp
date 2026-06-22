const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching active products...');
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products.json?status=active&limit=100`,
      { headers }
    );
    
    const products = res.data.products;
    console.log(`Fetched ${products.length} active products.\n`);
    
    const productList = products.map(p => ({
      id: p.id,
      title: p.title,
      product_type: p.product_type || '(No Type)',
      tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
      vendor: p.vendor
    }));

    console.log(JSON.stringify(productList, null, 2));

  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

main();
