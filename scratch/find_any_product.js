const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  let url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=250`;
  console.log('Searching all products for N_F...');
  try {
    while (url) {
      const res = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });
      
      for (const p of res.data.products) {
        if (p.title.toLowerCase().includes('n_f') || p.title.toLowerCase().includes('north') || p.title.toLowerCase().includes('dri-fit')) {
          console.log(`- ID: ${p.id}, Title: "${p.title}", Handle: "${p.handle}", Template Suffix: "${p.template_suffix}"`);
        }
      }
      
      const linkHeader = res.headers['link'];
      url = null;
      if (linkHeader) {
        const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (matches) {
          url = matches[1];
        }
      }
    }
    console.log('Search finished.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
