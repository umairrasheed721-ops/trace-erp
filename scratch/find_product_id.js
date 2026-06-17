const axios = require('axios');

async function main() {
  const productUrl = 'https://tracepk.com/products/multi-reflector-pum-a';
  const res = await axios.get(productUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const html = res.data;
  
  // Search for meta property og:url, product:, or similar
  const matches = html.match(/"rid":\s*(\d+)/) || html.match(/"id":\s*(\d{12,15})/g) || html.match(/meta\s+content="(\d{12,15})"/g) || html.match(/"product":\s*{\s*"id":\s*(\d+)/);
  console.log('Matches:', matches);

  // Look for meta tag: <meta property="og:image:secure_url" content="https://cdn.shopify.com/.../products/...">
  // Or look for window.ShopifyAnalytics
  const analyticsIdx = html.indexOf('var ShopifyAnalytics = ShopifyAnalytics || {};');
  if (analyticsIdx !== -1) {
    const chunk = html.substring(analyticsIdx, analyticsIdx + 1000);
    console.log('Analytics Chunk:', chunk);
  }

  // Look for Shopify.shop or meta tag
  const metaPid = html.match(/meta\s+property="og:id"\s+content="(\d+)"/) || html.match(/meta\s+name="twitter:data2"\s+content="(\d+)"/) || html.match(/"product_id":\s*(\d+)/);
  console.log('Meta product id:', metaPid);
}

main();
