const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const configsToDownload = [
  'templates/index.json',
  'sections/header-group.json'
];

async function downloadConfig(key) {
  const destPath = path.resolve(__dirname, '../../shopify_theme', key);
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  
  console.log(`Downloading ${key} from Shopify theme ${themeId}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const { asset } = await res.json();
      if (asset.value !== undefined) {
        fs.writeFileSync(destPath, asset.value, 'utf8');
        console.log(`✅ Successfully synced local ${key} with Shopify!`);
      } else {
        console.warn(`⚠️ Asset ${key} has no content.`);
      }
    } else {
      console.error(`❌ Failed to download ${key}. Status: ${res.status}`);
    }
  } catch (err) {
    console.error(`Error downloading ${key}:`, err);
  }
}

async function downloadAll() {
  for (const config of configsToDownload) {
    await downloadConfig(config);
  }
  console.log('Finished syncing configurations!');
}

downloadAll();
