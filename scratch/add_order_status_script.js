const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const url = `https://${shopDomain}/admin/api/2024-10/script_tags.json`;

  try {
    const getRes = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    console.log('Existing ScriptTags:', getRes.data);
  } catch (err) {
    console.error('Error fetching script tags:', err.response ? err.response.data : err.message);
  }
}

main();
