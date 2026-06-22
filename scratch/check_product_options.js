const axios = require('axios');

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
    const summaries = products.map(p => {
      const optionNames = p.options ? p.options.map(o => o.name) : [];
      const optionValues = p.options ? p.options.map(o => `${o.name}: ${o.values.join(', ')}`) : [];
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        options: optionValues
      };
    });
    
    console.log(JSON.stringify(summaries, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
