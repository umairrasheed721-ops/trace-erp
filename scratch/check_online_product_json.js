const axios = require('axios');

async function main() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';
  const themeId = '159705432323';
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=templates/product.json`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });
    console.log('Online product.json content:');
    console.log(res.data.asset.value);
  } catch (err) {
    console.error('Error fetching online product.json:', err.response ? err.response.data : err.message);
  }
}

main();
