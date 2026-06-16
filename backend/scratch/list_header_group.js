const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function downloadHeaderGroup() {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=sections/header-group.json`;
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
    console.log(data.asset.value);
  } catch (err) {
    console.error(err);
  }
}

downloadHeaderGroup();
