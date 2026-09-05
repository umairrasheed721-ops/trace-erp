const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);
const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';
const funnelLocalPath = path.join(themeDir, 'snippets/trace-cro-funnel.liquid');
const funnelContent = fs.readFileSync(funnelLocalPath, 'utf8');

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

    console.log(`📡 Uploading snippets/trace-cro-funnel.liquid to ${storeName} (Theme: ${activeTheme.name}, ID: ${activeTheme.id})...`);

    const res = await axios.put(
      `https://${shopDomain}/admin/api/2024-10/themes/${activeTheme.id}/assets.json`,
      { asset: { key: 'snippets/trace-cro-funnel.liquid', value: funnelContent } },
      { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );

    if (res.data?.asset?.key) {
      console.log(`  ✅ Successfully uploaded to ${storeName}!`);
    } else {
      console.error(`  ❌ Failed to upload to ${storeName}:`, res.data);
    }
  } catch (err) {
    console.error(`❌ Error uploading to ${storeName} (${shopDomain}):`, err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

async function main() {
  console.log('🚀 Uploading trace-cro-funnel.liquid across all connected Shopify stores...\n');

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

  console.log('\n🎉 Theme snippet push complete for all stores!');
}

main().catch(console.error);
