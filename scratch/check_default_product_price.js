const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  let url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=250`;
  console.log('Listing products with default templates:');
  try {
    while (url) {
      const res = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });
      
      for (const p of res.data.products) {
        if (p.template_suffix !== 'master-funnel' && p.template_suffix !== 'adi-track-bundle') {
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
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
