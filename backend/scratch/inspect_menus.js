const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function download() {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      console.error(`status: ${res.status}`);
      return;
    }
    const data = await res.json();
    const settings = JSON.parse(data.asset.value);
    
    // Find announcement bar sections in the header group
    const sections = settings.current.sections;
    console.log("Sections configured in the theme:");
    for (const [id, section] of Object.entries(sections)) {
      if (section.type.includes('announcement') || id.includes('announcement')) {
        console.log(`\nSection ID: ${id}`);
        console.log(JSON.stringify(section, null, 2));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

download();
