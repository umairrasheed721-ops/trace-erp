const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const util = require('util');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';
const localThemeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';

function getLocalFiles(dir, baseDir = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === '.git' || file === 'node_modules' || file === '.DS_Store') continue;
    const filePath = path.join(dir, file);
    const relativePath = path.join(baseDir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getLocalFiles(filePath, relativePath));
    } else {
      results.push({
        relativePath,
        absolutePath: filePath,
        size: stat.size,
        mtime: stat.mtime
      });
    }
  }
  return results;
}

async function main() {
  try {
    console.log('Fetching assets list from Shopify theme...');
    const res = await axios.get(`https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const onlineAssets = res.data.assets;
    const onlineMap = new Map();
    for (const asset of onlineAssets) {
      onlineMap.set(asset.key, asset);
    }

    console.log('Scanning local files...');
    const localFiles = getLocalFiles(localThemeDir);
    const localMap = new Map();
    for (const file of localFiles) {
      localMap.set(file.relativePath, file);
    }

    const upToDate = [];
    const different = [];
    const missingLocally = [];
    const missingOnline = [];

    // Compare online assets with local files
    for (const [key, online] of onlineMap.entries()) {
      if (!localMap.has(key)) {
        missingLocally.push(online);
      } else {
        const local = localMap.get(key);
        const content = fs.readFileSync(local.absolutePath);
        
        // 1. Try raw MD5 comparison
        const rawMd5 = crypto.createHash('md5').update(content).digest('hex');
        let isMatch = (rawMd5 === online.checksum);

        // 2. If JSON and not matched, try minified MD5 comparison
        if (!isMatch && key.endsWith('.json')) {
          try {
            const minified = JSON.stringify(JSON.parse(content.toString('utf8')));
            const minifiedMd5 = crypto.createHash('md5').update(minified).digest('hex');
            isMatch = (minifiedMd5 === online.checksum);
          } catch (e) {
            // Invalid JSON
          }
        }

        // 3. If still not matched and it's JSON, do a deep equality check
        if (!isMatch && key.endsWith('.json')) {
          try {
            console.log(`Performing deep equality check on different JSON: ${key}...`);
            const onlineAssetUrl = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
            const onlineAssetRes = await axios.get(onlineAssetUrl, {
              headers: { 'X-Shopify-Access-Token': accessToken }
            });
            const onlineObj = JSON.parse(onlineAssetRes.data.asset.value);
            const localObj = JSON.parse(content.toString('utf8'));
            if (util.isDeepStrictEqual(localObj, onlineObj)) {
              isMatch = true;
            }
          } catch (e) {
            // Failed deep comparison
          }
        }

        if (isMatch) {
          upToDate.push({ key, local, online });
        } else {
          different.push({
            key,
            local,
            online,
            rawMd5,
            onlineMd5: online.checksum
          });
        }
      }
    }

    // Check for files that are local but not online
    for (const [key, local] of localMap.entries()) {
      if (!onlineMap.has(key)) {
        missingOnline.push(local);
      }
    }

    console.log('\n======================================');
    console.log('⚡ Shopify Theme Sync Status Report ⚡');
    console.log('======================================');
    console.log(`Up to Date: ${upToDate.length} files`);
    console.log(`Different Content: ${different.length} files`);
    console.log(`Missing Locally (need download): ${missingLocally.length} files`);
    console.log(`Missing Online (need upload): ${missingOnline.length} files`);
    console.log('======================================\n');

    if (different.length > 0) {
      console.log('--- DIFFERENT FILES ---');
      for (const item of different) {
        console.log(`- ${item.key} (Size: local ${item.local.size} vs online ${item.online.size})`);
      }
      console.log();
    }

  } catch (err) {
    console.error('Error during comparison:', err.message);
  }
}

main();
