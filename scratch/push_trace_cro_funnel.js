const fs = require('fs');
const path = require('path');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function main() {
  const filePath = '/Users/umairrasheed/Desktop/antigravity/shopify_theme/snippets/trace-cro-funnel.liquid';
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    return;
  }

  const value = fs.readFileSync(filePath, 'utf8');
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;

  const payload = {
    asset: {
      key: 'snippets/trace-cro-funnel.liquid',
      value: value
    }
  };

  console.log(`Uploading snippets/trace-cro-funnel.liquid to Shopify theme ${themeId} using Axios...`);
  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200 || res.status === 201) {
      console.log('✅ Successfully uploaded snippets/trace-cro-funnel.liquid!');
    } else {
      console.error(`❌ Failed to upload. Status: ${res.status}, Data:`, res.data);
    }
  } catch (err) {
    console.error('Error uploading:', err.response ? err.response.data : err.message);
  }
}

main();
