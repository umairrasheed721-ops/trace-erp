const axios = require('axios');
const fs = require('fs');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products.json?status=active&limit=100`,
      { headers }
    );
    
    const products = res.data.products;
    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      body_html: p.body_html
    }));

    fs.writeFileSync('/Users/umairrasheed/Desktop/antigravity/trace-erp/scratch/all_descriptions.json', JSON.stringify(data, null, 2));
    console.log('✅ Successfully dumped descriptions to scratch/all_descriptions.json');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
