const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const url = `https://${shopDomain}/admin/api/2024-10/script_tags.json`;

  // First fetch active theme asset URL for trace-whatsapp-community.js
  const themeUrl = `https://${shopDomain}/admin/api/2024-10/themes/159705432323/assets.json?asset[key]=assets/trace-whatsapp-community.js`;
  const assetRes = await axios.get(themeUrl, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  
  const publicAssetUrl = assetRes.data.asset.public_url;
  console.log('Public Asset URL for script:', publicAssetUrl);

  // Register ScriptTag with display_scope order_status
  const payload = {
    script_tag: {
      event: 'onload',
      src: publicAssetUrl,
      display_scope: 'order_status'
    }
  };

  const createRes = await axios.post(url, payload, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  console.log('Status:', createRes.status, 'Response Data:', createRes.data);
}

main().catch(err => {
  if (err.response) {
    console.error('Response Error Status:', err.response.status, 'Data:', JSON.stringify(err.response.data));
  } else {
    console.error('Error:', err.message);
  }
});
