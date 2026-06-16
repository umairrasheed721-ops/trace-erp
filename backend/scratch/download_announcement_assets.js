const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const assets = [
  'sections/announcement-bar.liquid',
  'sections/header-group.json'
];

async function download() {
  const dir = path.join(__dirname, 'shopify_theme');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const assetKey of assets) {
    const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
    try {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        console.error(`Failed to download ${assetKey}: status ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data.asset.value;
      const localPath = path.join(dir, assetKey.replace('/', '_'));
      fs.writeFileSync(localPath, content, 'utf8');
      console.log(`Saved ${assetKey} to ${localPath}`);
    } catch (err) {
      console.error(`Error downloading ${assetKey}:`, err);
    }
  }
}

download();
