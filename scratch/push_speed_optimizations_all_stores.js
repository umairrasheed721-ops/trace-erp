const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { DatabaseSync } = require('node:sqlite');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);
const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

const themeLiquidPath = path.join(themeDir, 'layout/theme.liquid');
const baseCssPath = path.join(themeDir, 'assets/base.css');
const headerLiquidPath = path.join(themeDir, 'sections/header.liquid');
const cardProductPath = path.join(themeDir, 'snippets/card-product.liquid');
const settingsSchemaPath = path.join(themeDir, 'config/settings_schema.json');
const wpPopupPath = path.join(themeDir, 'snippets/trace-whatsapp-community-popup.liquid');

const themeLiquidContent = fs.readFileSync(themeLiquidPath, 'utf8');
const baseCssContent = fs.readFileSync(baseCssPath, 'utf8');
const headerLiquidContent = fs.readFileSync(headerLiquidPath, 'utf8');
const cardProductContent = fs.readFileSync(cardProductPath, 'utf8');
const settingsSchemaContent = fs.readFileSync(settingsSchemaPath, 'utf8');
const wpPopupContent = fs.readFileSync(wpPopupPath, 'utf8');

const filesToUpload = [
  { key: 'layout/theme.liquid', value: themeLiquidContent },
  { key: 'assets/base.css', value: baseCssContent },
  { key: 'sections/header.liquid', value: headerLiquidContent },
  { key: 'snippets/card-product.liquid', value: cardProductContent },
  { key: 'config/settings_schema.json', value: settingsSchemaContent },
  { key: 'snippets/trace-whatsapp-community-popup.liquid', value: wpPopupContent }
];

async function uploadToStore(shopDomain, accessToken, storeName) {
  try {
    const themesRes = await axios.get(`https://${shopDomain}/admin/api/2024-10/themes.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    const themes = themesRes.data.themes || [];
    const activeTheme = themes.find(t => t.role === 'main');
    if (!activeTheme) {
      console.error(`❌ No active main theme found for ${storeName} (${shopDomain})`);
      return;
    }

    console.log(`📡 Uploading Speed Optimizations to ${storeName} (Theme: ${activeTheme.name}, ID: ${activeTheme.id})...`);

    for (const file of filesToUpload) {
      const res = await axios.put(
        `https://${shopDomain}/admin/api/2024-10/themes/${activeTheme.id}/assets.json`,
        { asset: file },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
      );

      if (res.data?.asset?.key) {
        console.log(`  ✅ Successfully uploaded ${file.key} to ${storeName}!`);
      } else {
        console.error(`  ❌ Failed to upload ${file.key} to ${storeName}:`, res.data);
      }
    }
  } catch (err) {
    console.error(`❌ Error uploading to ${storeName} (${shopDomain}):`, err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

async function main() {
  console.log('🚀 Deploying Theme Speed Optimizations across all connected Shopify stores...\n');

  // 1. Trace Store
  await uploadToStore('041839-3.myshopify.com', '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', 'Trace Store');

  // 2. Ace Store
  const aceStore = db.prepare("SELECT store_name, shop_domain, access_token FROM stores WHERE shop_domain LIKE '%1i7tnb%' OR store_name LIKE '%ACE%'").get();
  if (aceStore && aceStore.access_token) {
    await uploadToStore(aceStore.shop_domain, aceStore.access_token, aceStore.store_name);
  }

  // 3. Rabbi Trends
  try {
    const rabbiRes = await axios.get('https://trace-erp-production.up.railway.app/api/public/get-rabbi-token');
    if (rabbiRes.data && rabbiRes.data.domain && rabbiRes.data.token) {
      await uploadToStore(rabbiRes.data.domain, rabbiRes.data.token, 'Rabbi Trends');
    }
  } catch (e) {
    console.error('⚠️ Could not fetch Rabbi Trends credentials:', e.message);
  }

  console.log('\n📦 Refreshing Master Theme ZIP...');
  try {
    const zipOutput = execSync('node package_clean_theme.js', { cwd: themeDir, encoding: 'utf8' });
    console.log(zipOutput);
  } catch (e) {
    console.error('❌ Failed to refresh Master ZIP:', e.message);
  }

  console.log('\n🎉 Speed Optimizations deployment complete across all 4 locations!');
}

main().catch(console.error);
