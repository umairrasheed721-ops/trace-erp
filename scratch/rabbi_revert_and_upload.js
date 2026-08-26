const fs = require('fs');
const path = require('path');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const FormData = require('form-data');

// Files we added to Dawn that don't belong there — safe to delete (restores Dawn defaults)
const tracCustomFiles = [
  'snippets/trace-cro-funnel.liquid',
  'snippets/trace-cod-checkout.liquid',
  'snippets/trace-floating-video.liquid',
  'snippets/trace-reviews.liquid',
  'snippets/card-product.liquid',
  'snippets/product-thumbnail.liquid',
  'snippets/price.liquid',
  'snippets/buy-buttons.liquid',
  'snippets/cart-drawer.liquid',
  'snippets/cart-notification.liquid',
  'sections/trace-reviews.liquid',
  'sections/custom-hero-slider.liquid',
  'sections/main-product.liquid',
  'sections/main-cart-footer.liquid',
  'sections/header.liquid',
  'sections/footer.liquid',
  'assets/trace-whatsapp-community.js',
  'assets/base.css',
  'assets/section-main-product.css',
  'config/settings_schema.json',
  'layout/theme.liquid'
];

const API_BASE = 'https://trace-erp-production.up.railway.app';
const ZIP_PATH = '/Users/umairrasheed/Desktop/antigravity/trace-dynamic-theme.zip';

async function getRabbiToken() {
  const res = await fetch(`${API_BASE}/api/public/deploy-theme-all`);
  const data = await res.json();
  const rabbi = (data.results || []).find(r => r.domain.includes('72d3a1-e7'));
  return { domain: rabbi?.domain, allThemes: rabbi?.allThemes };
}

async function getStoreAccessToken() {
  // Use the upload-theme-asset endpoint to test — we need raw token
  // Query directly from Railway DB via a direct endpoint
  const res = await fetch(`${API_BASE}/api/public/get-rabbi-token`);
  if (res.ok) {
    const data = await res.json();
    return data.token;
  }
  return null;
}

async function revertDawn(domain, token, dawnThemeId) {
  console.log(`\n🔄 Reverting Dawn theme (ID: ${dawnThemeId}) on ${domain}...`);
  for (const key of tracCustomFiles) {
    try {
      const res = await fetch(
        `https://${domain}/admin/api/2024-10/themes/${dawnThemeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: { 'X-Shopify-Access-Token': token } }
      );
      if (res.status === 200 || res.status === 204) {
        console.log(`  ✅ Reverted (deleted): ${key}`);
      } else if (res.status === 404) {
        console.log(`  ⚠️  Not found (already clean): ${key}`);
      } else {
        const txt = await res.text();
        console.error(`  ❌ Error deleting ${key}: ${res.status} ${txt.slice(0, 80)}`);
      }
    } catch (e) {
      console.error(`  ❌ ${key}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

async function uploadZipAsNewTheme(domain, token) {
  console.log(`\n📦 Uploading trace-dynamic-theme.zip as NEW theme on ${domain}...`);
  
  if (!fs.existsSync(ZIP_PATH)) {
    console.error(`❌ ZIP not found at: ${ZIP_PATH}`);
    return;
  }

  const form = new FormData();
  form.append('theme[name]', 'trace-dynamic-theme');
  form.append('theme[role]', 'unpublished');
  form.append('theme[src]', fs.createReadStream(ZIP_PATH), {
    filename: 'trace-dynamic-theme.zip',
    contentType: 'application/zip'
  });

  try {
    const res = await fetch(`https://${domain}/admin/api/2024-10/themes.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        ...form.getHeaders()
      },
      body: form
    });

    const data = await res.json();
    if (res.ok && data.theme) {
      console.log(`  ✅ New theme created!`);
      console.log(`  📋 Theme ID: ${data.theme.id}`);
      console.log(`  📋 Theme Name: ${data.theme.name}`);
      console.log(`  📋 Status: ${data.theme.processing ? 'Processing...' : 'Ready'}`);
    } else {
      console.error(`  ❌ Failed to create theme:`, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(`  ❌ Upload error: ${e.message}`);
  }
}

async function run() {
  console.log('📡 Fetching Rabbi Trends token...');
  const { domain, allThemes } = await getRabbiToken();
  
  if (!domain) {
    console.error('❌ Rabbi Trends not found in ERP');
    return;
  }

  const dawn = allThemes?.find(t => t.name === 'Dawn' && t.role === 'main');
  if (!dawn) {
    console.error('❌ Dawn active theme not found');
    return;
  }

  console.log(`✅ Domain: ${domain}`);
  console.log(`✅ Dawn Theme ID: ${dawn.id}`);

  // We need the raw access token — fetch from backend
  const tokenRes = await fetch(`${API_BASE}/api/public/get-rabbi-token`);
  
  if (!tokenRes.ok) {
    console.error('❌ Could not fetch Rabbi token from backend. Adding endpoint...');
    console.log('\n⚠️  Please run this after adding /api/public/get-rabbi-token endpoint to backend.');
    return;
  }
  
  const { token } = await tokenRes.json();

  // Step 1: Revert Dawn
  await revertDawn(domain, token, dawn.id);

  // Step 2: Upload ZIP as new theme
  await uploadZipAsNewTheme(domain, token);
}

run();
