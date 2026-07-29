const axios = require('axios');

async function main() {
  const shopDomain = 'tracepk.com';
  const accessToken = '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';
  let url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=250`;
  
  console.log('Searching all products...');
  try {
    while (url) {
      const res = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });
      
      for (const p of res.data.products) {
        const titleLower = p.title.toLowerCase();
        if (titleLower.includes('multi') || titleLower.includes('ref') || titleLower.includes('pro') || titleLower.includes('active')) {
          console.log(`- ID: ${p.id}, Title: "${p.title}", Handle: "${p.handle}"`);
        }
      }
      
      // Check link header for next page
      const linkHeader = res.headers['link'];
      url = null;
      if (linkHeader) {
        const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (matches) {
          url = matches[1];
        }
      }
    }
    console.log('Search complete.');
  } catch (err) {
    console.error('Error fetching products:', err.response ? err.response.data : err.message);
  }
}

main();
