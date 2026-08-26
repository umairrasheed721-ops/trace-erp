const fs = require('fs');
const path = require('path');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

const filesToUpload = [
  'snippets/trace-cro-funnel.liquid',
  'layout/theme.liquid',
  'snippets/product-thumbnail.liquid',
  'snippets/price.liquid',
  'snippets/card-product.liquid',
  'assets/base.css',
  'assets/trace-whatsapp-community.js',
  'snippets/trace-cod-checkout.liquid',
  'snippets/trace-floating-video.liquid',
  'sections/custom-hero-slider.liquid',
  'sections/header.liquid',
  'sections/footer.liquid',
  'config/settings_schema.json',
  'sections/trace-reviews.liquid',
  'snippets/trace-reviews.liquid',
  'snippets/cart-drawer.liquid',
  'snippets/cart-notification.liquid',
  'sections/main-cart-footer.liquid',
  'snippets/buy-buttons.liquid',
  'sections/main-product.liquid',
  'assets/section-main-product.css'
];

async function uploadAssetToStore(shopDomain, accessToken, themeId, key, localPath) {
  if (!fs.existsSync(localPath)) {
    console.warn(`  ⚠️ File does not exist, skipping: ${localPath}`);
    return;
  }

  const isBinary = localPath.endsWith('.woff2') || localPath.endsWith('.png') || localPath.endsWith('.jpg') || localPath.endsWith('.gif');
  const payload = { asset: { key } };
  if (isBinary) {
    payload.asset.attachment = fs.readFileSync(localPath).toString('base64');
  } else {
    payload.asset.value = fs.readFileSync(localPath, 'utf8');
  }

  try {
    const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`  ✅ Successfully uploaded ${key}!`);
    } else {
      const txt = await res.text();
      console.error(`  ❌ Failed ${key}: ${res.status} ${txt.slice(0, 100)}`);
    }
  } catch (err) {
    console.error(`  ❌ Error ${key}: ${err.message}`);
  }
}

async function run() {
  console.log('🚀 Querying Rabbi Trends access token from ERP sync endpoint...');
  try {
    const syncRes = await fetch(`${API_BASE}/api/public/deploy-theme-all`);
    const syncData = await syncRes.json();
    console.log('Sync Response:', JSON.stringify(syncData, null, 2));

    // Also let's check if we can push directly using the store tokens
    const rabbiResult = (syncData.results || []).find(r => r.domain.includes('72d3a1-e7'));
    if (rabbiResult && rabbiResult.allThemes) {
      console.log('\n--- RABBI TRENDS THEMES LIST ---');
      console.log(rabbiResult.allThemes);
    }
  } catch (e) {
    console.error('Error querying deploy endpoint:', e.message);
  }
}

run();
