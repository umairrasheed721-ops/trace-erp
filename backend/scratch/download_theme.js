const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const outputDir = path.resolve(__dirname, '../../shopify_theme');

// Helper to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
      console.log(`Rate limited (429). Retrying after ${retryAfter}s...`);
      await sleep(retryAfter * 1000 + 500);
      continue;
    }
    return res;
  }
  throw new Error(`Failed after ${retries} retries`);
}

async function downloadTheme() {
  console.log(`Starting theme download to: ${outputDir}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: List all assets
  const listUrl = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;
  const listRes = await fetchWithRetry(listUrl, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!listRes.ok) {
    console.error(`Failed to list theme assets: ${listRes.status} ${listRes.statusText}`);
    return;
  }

  const { assets } = await listRes.json();
  console.log(`Found ${assets.length} assets. Downloading them one by one...`);

  // Step 2: Download each asset
  let count = 0;
  for (const asset of assets) {
    count++;
    const assetKey = asset.key;
    const destPath = path.join(outputDir, assetKey);
    const destDir = path.dirname(destPath);

    console.log(`[${count}/${assets.length}] Downloading ${assetKey}...`);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const detailUrl = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
    try {
      const res = await fetchWithRetry(detailUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        console.error(`Failed to download ${assetKey}: ${res.status}`);
        continue;
      }

      const { asset: detail } = await res.json();
      if (detail.value !== undefined) {
        // Text asset
        fs.writeFileSync(destPath, detail.value, 'utf8');
      } else if (detail.attachment !== undefined) {
        // Binary asset
        const buffer = Buffer.from(detail.attachment, 'base64');
        fs.writeFileSync(destPath, buffer);
      } else {
        console.warn(`Asset ${assetKey} has no value or attachment.`);
      }

      // Add a tiny delay between requests to be gentle on rate limit
      await sleep(100);
    } catch (err) {
      console.error(`Error downloading ${assetKey}:`, err);
    }
  }

  console.log('Theme download completed successfully!');
}

downloadTheme();
