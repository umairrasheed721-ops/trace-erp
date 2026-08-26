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

async function uploadAsset(shopDomain, accessToken, themeId, key, localPath) {
  if (!fs.existsSync(localPath)) {
    console.warn(`⚠️ File does not exist, skipping: ${localPath}`);
    return;
  }

  const isBinary = localPath.endsWith('.woff2') || localPath.endsWith('.png') || localPath.endsWith('.jpg') || localPath.endsWith('.gif');
  const payload = { asset: { key } };
  if (isBinary) {
    payload.asset.attachment = fs.readFileSync(localPath).toString('base64');
  } else {
    payload.asset.value = fs.readFileSync(localPath, 'utf8');
  }

  console.log(`Uploading ${key} to ${shopDomain} theme ${themeId}...`);
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
      console.log(`✅ Successfully uploaded ${key}!`);
    } else {
      const txt = await res.text();
      console.error(`❌ Failed ${key}: ${res.status} ${txt.slice(0, 100)}`);
    }
  } catch (err) {
    console.error(`❌ Error ${key}: ${err.message}`);
  }
}

async function run() {
  console.log('📡 Fetching active store token for Rabbi Trends from ERP...');
  const res = await fetch(`${API_BASE}/api/public/deploy-theme-all`);
  const data = await res.json();
  const rabbi = (data.results || []).find(r => r.domain.includes('72d3a1-e7'));

  if (!rabbi) {
    console.error('❌ Rabbi Trends store not found in ERP API output.');
    return;
  }

  const shopDomain = rabbi.domain;
  // Let's get access token by querying stores endpoint or store details
  console.log(`🚀 Found Rabbi Trends domain: ${shopDomain}`);
  console.log(`Themes found:`, rabbi.allThemes);

  const mainTheme = (rabbi.allThemes || []).find(t => t.role === 'main');
  const dynamicTheme = (rabbi.allThemes || []).find(t => t.name === 'trace-dynamic-theme');
  const targetThemeIds = [mainTheme?.id, dynamicTheme?.id].filter(Boolean);

  console.log(`Targeting Theme IDs: ${targetThemeIds.join(', ')}`);

  // We query the access token from production database or endpoint
  const tokenRes = await fetch(`${API_BASE}/api/finance/diagnose-shopify-sync?store_id=14`);
  // Or fetch via auth endpoint
  // Let's write a quick token query in backend or use the verified store token
}

run();
