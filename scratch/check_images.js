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
      const images = p.images ? p.images.map(img => img.src.split('/').pop().split('?')[0]) : [];
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        images: images.slice(0, 3)
      };
    });
    
    console.log(JSON.stringify(summaries, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
