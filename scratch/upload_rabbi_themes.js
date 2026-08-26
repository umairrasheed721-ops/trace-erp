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

async function run() {
  console.log('📡 Querying Rabbi Trends access token from Railway server...');
  const syncRes = await fetch(`${API_BASE}/api/public/deploy-theme-all`);
  const syncData = await syncRes.json();
  const rabbi = (syncData.results || []).find(r => r.domain.includes('72d3a1-e7'));

  if (!rabbi) {
    console.error('❌ Could not find Rabbi Trends in ERP backend results');
    return;
  }

  console.log(`✅ Found Rabbi Trends domain: ${rabbi.domain}`);
  console.log('Available themes on Rabbi Trends:', rabbi.allThemes);

  // Target both Dawn (154004586686) and trace-dynamic-theme (155789197502)
  const targetThemeIds = [154004586686, 155789197502];

  for (const themeId of targetThemeIds) {
    const themeObj = (rabbi.allThemes || []).find(t => t.id === themeId);
    const themeName = themeObj ? themeObj.name : themeId;

    console.log(`\n==================================================`);
    console.log(`🚀 Uploading Theme Files to Rabbi Trends Theme: "${themeName}" (ID: ${themeId})...`);
    console.log(`==================================================`);

    for (const key of filesToUpload) {
      const localPath = path.join(themeDir, key);
      if (!fs.existsSync(localPath)) continue;

      const isBinary = localPath.endsWith('.woff2') || localPath.endsWith('.png') || localPath.endsWith('.jpg') || localPath.endsWith('.gif');
      const payload = { store_id: 14, theme_id: themeId, key };
      if (isBinary) {
        payload.attachment = fs.readFileSync(localPath).toString('base64');
      } else {
        payload.value = fs.readFileSync(localPath, 'utf8');
      }

      try {
        const upRes = await fetch(`${API_BASE}/api/public/upload-theme-asset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const upData = await upRes.json();
        if (upRes.ok && upData.success) {
          console.log(`  ✅ Successfully uploaded ${key} to theme ${themeId}`);
        } else {
          console.error(`  ❌ Failed ${key} on theme ${themeId}:`, upData);
        }
      } catch (err) {
        console.error(`  ❌ Error ${key}: ${err.message}`);
      }
    }
  }
}

run();
