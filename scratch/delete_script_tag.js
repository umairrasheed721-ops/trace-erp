const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const url = `https://${shopDomain}/admin/api/2024-10/script_tags.json`;
  const res = await axios.get(url, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  
  console.log('Script tags list:', res.data.script_tags);
  for (const st of res.data.script_tags) {
    console.log('Deleting script tag:', st.id);
    await axios.delete(`https://${shopDomain}/admin/api/2024-10/script_tags/${st.id}.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    console.log('Deleted script tag:', st.id);
  }
}

main().catch(console.error);
