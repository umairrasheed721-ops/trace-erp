const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching active products with descriptions...');
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products.json?status=active&limit=100`,
      { headers }
    );
    
    const products = res.data.products;
    const details = products.map(p => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      product_type: p.product_type,
      tags: p.tags,
      body_snippet: p.body_html ? p.body_html.replace(/<[^>]*>/g, ' ').substring(0, 150).trim() : ''
    }));
    
    console.log(JSON.stringify(details, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
