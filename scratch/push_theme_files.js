const fs = require('fs');
const path = require('path');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

async function uploadAsset(key, localPath) {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;
  
  if (!fs.existsSync(localPath)) {
    console.warn(`⚠️ File does not exist, skipping: ${localPath}`);
    return;
  }

  const payload = {
    asset: {
      key: key
    }
  };

  // Check if file is binary (e.g. woff2)
  const isBinary = localPath.endsWith('.woff2') || localPath.endsWith('.png') || localPath.endsWith('.jpg') || localPath.endsWith('.gif');
  if (isBinary) {
    const data = fs.readFileSync(localPath);
    payload.asset.attachment = data.toString('base64');
  } else {
    payload.asset.value = fs.readFileSync(localPath, 'utf8');
  }

  console.log(`Uploading ${key} to Shopify theme ${themeId}...`);
  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200 || res.status === 201) {
      console.log(`✅ Successfully uploaded ${key}!`);
    } else {
      console.error(`❌ Failed to upload ${key}. Status: ${res.status}`);
    }
  } catch (err) {
    console.error(`❌ Error uploading ${key}:`, err.response ? err.response.data : err.message);
  }
}

async function main() {
  // 1. Upload snippets/trace-cro-funnel.liquid
  await uploadAsset('snippets/trace-cro-funnel.liquid', path.join(themeDir, 'snippets/trace-cro-funnel.liquid'));

  // 2. Upload layout/theme.liquid
  await uploadAsset('layout/theme.liquid', path.join(themeDir, 'layout/theme.liquid'));

  // 3. Upload Montserrat font assets if they exist locally
  const fonts = [
    'montserrat-400-normal.woff2',
    'montserrat-500-normal.woff2',
    'montserrat-700-normal.woff2',
    'montserrat-900-italic.woff2'
  ];

  for (const font of fonts) {
    await uploadAsset(`assets/${font}`, path.join(themeDir, 'assets', font));
  }

  // 4. Upload config/settings_schema.json and settings_data.json
  await uploadAsset('config/settings_schema.json', path.join(themeDir, 'config/settings_schema.json'));
  await uploadAsset('config/settings_data.json', path.join(themeDir, 'config/settings_data.json'));

  console.log('All theme uploads completed!');
}

main();
