const axios = require('axios');
const fs = require('fs');
const path = require('path');

const shopDomain = 'tracepk.com';
const accessToken = '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';
const themeId = '159705432323'; // Active theme

const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

async function downloadAsset(key) {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${key}`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    if (res.data && res.data.asset && res.data.asset.value) {
      return res.data.asset.value;
    }
  } catch (err) {
    console.error(`❌ Error downloading ${key} from theme ${themeId}:`, err.response ? err.response.data : err.message);
  }
  return null;
}

async function main() {
  console.log(`📡 Fetching latest configurations from active theme ${themeId}...`);
  
  const indexContent = await downloadAsset('templates/index.json');
  if (indexContent) {
    const localPath = path.join(themeDir, 'templates/index.json');
    fs.writeFileSync(localPath, indexContent);
    console.log(`✅ Successfully pulled templates/index.json to local workspace.`);
  }

  const settingsContent = await downloadAsset('config/settings_data.json');
  if (settingsContent) {
    const localPath = path.join(themeDir, 'config/settings_data.json');
    fs.writeFileSync(localPath, settingsContent);
    console.log(`✅ Successfully pulled config/settings_data.json to local workspace.`);
  }

  console.log('🎉 Pull completed successfully!');
}

main();
