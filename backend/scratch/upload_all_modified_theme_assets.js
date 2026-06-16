const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const filesToUpload = [
  'layout/theme.liquid',
  'snippets/header-drawer.liquid',
  'snippets/header-dropdown-menu.liquid',
  'snippets/header-mega-menu.liquid',
  'snippets/trace-order-tracker.liquid',
  'sections/announcement-bar.liquid'
];

async function uploadAsset(key) {
  const filePath = path.resolve(__dirname, '../../shopify_theme', key);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    return;
  }

  const value = fs.readFileSync(filePath, 'utf8');
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;

  const payload = {
    asset: {
      key: key,
      value: value
    }
  };

  console.log(`Uploading ${key} to Shopify theme ${themeId}...`);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`✅ Successfully uploaded ${key}!`);
    } else {
      const text = await res.text();
      console.error(`❌ Failed to upload ${key}. Status: ${res.status}, Body: ${text}`);
    }
  } catch (err) {
    console.error(`Error uploading ${key}:`, err);
  }
}

async function uploadAll() {
  for (const file of filesToUpload) {
    await uploadAsset(file);
  }
  console.log('Finished uploading all modified assets to live theme!');
}

uploadAll();
