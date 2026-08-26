const fs = require('fs');
const axios = require('axios');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const themeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

// Only the file that changed
const FILES_TO_PUSH = [
  { key: 'snippets/trace-reviews.liquid', local: `${themeDir}/snippets/trace-reviews.liquid` }
];

async function run() {
  // Get Rabbi Trends token + active theme ID
  const tokenRes = await fetch(`${API_BASE}/api/public/get-rabbi-token`);
  const { domain, token } = await tokenRes.json();

  const themesRes = await fetch(`https://${domain}/admin/api/2024-10/themes.json`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const { themes } = await themesRes.json();
  const activeTheme = themes.find(t => t.role === 'main');
  if (!activeTheme) { console.error('❌ No active theme on Rabbi Trends!'); return; }

  console.log(`✅ Pushing to Rabbi Trends: ${domain}`);
  console.log(`✅ Active Theme: ${activeTheme.name} (ID: ${activeTheme.id})`);

  for (const { key, local } of FILES_TO_PUSH) {
    if (!fs.existsSync(local)) { console.error(`❌ Missing: ${local}`); continue; }
    const value = fs.readFileSync(local, 'utf8');
    const res = await axios.put(
      `https://${domain}/admin/api/2024-10/themes/${activeTheme.id}/assets.json`,
      { asset: { key, value } },
      { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
    );
    if (res.data?.asset?.key) {
      console.log(`  ✅ Pushed: ${key}`);
    } else {
      console.error(`  ❌ Failed: ${key}`, res.data);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('\n🎉 Done! trace-reviews.liquid updated on Rabbi Trends live theme.');
}

run().catch(console.error);
