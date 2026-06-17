const fs = require('fs');
const path = require('path');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function uploadAsset(localPath, shopifyKey) {
  if (!fs.existsSync(localPath)) {
    console.error(`❌ Local file does not exist: ${localPath}`);
    return false;
  }

  const value = fs.readFileSync(localPath, 'utf8');
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;

  const payload = {
    asset: {
      key: shopifyKey,
      value: value
    }
  };

  console.log(`Uploading ${shopifyKey} to theme ${themeId}...`);
  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200 || res.status === 201) {
      console.log(`✅ Successfully uploaded ${shopifyKey}!`);
      return true;
    } else {
      console.error(`❌ Failed to upload ${shopifyKey}. Status: ${res.status}, Data:`, res.data);
      return false;
    }
  } catch (err) {
    console.error(`❌ Error uploading ${shopifyKey}:`, err.response ? err.response.data : err.message);
    return false;
  }
}

async function main() {
  const assetsToUpload = [
    {
      local: '/Users/umairrasheed/Desktop/antigravity/shopify_theme/snippets/trace-cro-funnel.liquid',
      remote: 'snippets/trace-cro-funnel.liquid'
    },
    {
      local: '/Users/umairrasheed/Desktop/antigravity/shopify_theme/snippets/card-product.liquid',
      remote: 'snippets/card-product.liquid'
    },
    {
      local: '/Users/umairrasheed/Desktop/antigravity/shopify_theme/assets/global.js',
      remote: 'assets/global.js'
    },
    {
      local: '/Users/umairrasheed/Desktop/antigravity/shopify_theme/layout/theme.liquid',
      remote: 'layout/theme.liquid'
    },
    {
      local: '/Users/umairrasheed/Desktop/antigravity/shopify_theme/sections/custom-hero-slider.liquid',
      remote: 'sections/custom-hero-slider.liquid'
    }
  ];

  for (const asset of assetsToUpload) {
    await uploadAsset(asset.local, asset.remote);
  }
}

main();
