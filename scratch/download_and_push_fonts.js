const fs = require('fs');
const path = require('path');
const https = require('https');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const localThemeDir = '/Users/umairrasheed/Desktop/antigravity/shopify_theme';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper to make HTTPS requests
function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status: ${res.statusCode}, Body: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to fetch a URL (handles redirects and custom headers)
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Failed to load ${url}, status: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function uploadToShopify(key, content, isBinary = false) {
  const options = {
    hostname: shopDomain,
    path: `/admin/api/2024-10/themes/${themeId}/assets.json`,
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  };

  const payload = {
    asset: {
      key: key
    }
  };

  if (isBinary) {
    payload.asset.attachment = content.toString('base64');
  } else {
    payload.asset.value = content;
  }

  console.log(`Uploading ${key} to Shopify theme ${themeId}...`);
  try {
    await makeRequest(options, payload);
    console.log(`✅ Successfully uploaded ${key}!`);
  } catch (err) {
    console.error(`❌ Failed to upload ${key}:`, err.message);
  }
}

async function main() {
  console.log('--- STARTING SYSTEM-DYNAMIC FONT DOWNLOAD & SHOPIFY UPLOAD ---');

  const cssUrl = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,700;1,900&display=swap';
  console.log('Fetching Montserrat CSS from Google Fonts using Chrome User-Agent...');
  
  try {
    const cssBuffer = await fetchUrl(cssUrl, { 'User-Agent': USER_AGENT });
    const cssContent = cssBuffer.toString('utf8');
    
    // Parse CSS to find latin subset font URLs
    const fontFaceBlocks = cssContent.split('}');
    
    const targets = {
      'assets/montserrat-400-normal.woff2': { weight: '400', style: 'normal' },
      'assets/montserrat-500-normal.woff2': { weight: '500', style: 'normal' },
      'assets/montserrat-700-normal.woff2': { weight: '700', style: 'normal' },
      'assets/montserrat-900-italic.woff2': { weight: '900', style: 'italic' }
    };

    const downloaded = {};

    for (const block of fontFaceBlocks) {
      if (!block.includes('font-family') || !block.includes('src: url')) continue;
      
      const weightMatch = block.match(/font-weight:\s*(\d+);/);
      const styleMatch = block.match(/font-style:\s*(\w+);/);
      const urlMatch = block.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/);
      const latinMatch = block.includes('/* latin */');

      if (weightMatch && styleMatch && urlMatch && latinMatch) {
        const weight = weightMatch[1];
        const style = styleMatch[1];
        const url = urlMatch[1];

        for (const [key, target] of Object.entries(targets)) {
          if (target.weight === weight && target.style === style && !downloaded[key]) {
            console.log(`Found Montserrat ${weight} (${style}): Downloading from ${url}...`);
            const fontBuffer = await fetchUrl(url);
            
            // Upload to Shopify
            await uploadToShopify(key, fontBuffer, true);
            
            // Save local copy
            const localPath = path.join(localThemeDir, key);
            const localDir = path.dirname(localPath);
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }
            fs.writeFileSync(localPath, fontBuffer);
            console.log(`💾 Saved local copy to ${localPath}`);
            downloaded[key] = true;
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch and parse Google Fonts:', err.message);
  }

  // 2. Upload snippets/trace-cro-funnel.liquid
  console.log('\nUploading snippets/trace-cro-funnel.liquid...');
  try {
    const filePath = path.join(localThemeDir, 'snippets/trace-cro-funnel.liquid');
    if (fs.existsSync(filePath)) {
      const val = fs.readFileSync(filePath, 'utf8');
      await uploadToShopify('snippets/trace-cro-funnel.liquid', val, false);
    }
  } catch (err) {
    console.error('❌ Failed to upload snippets/trace-cro-funnel.liquid:', err.message);
  }

  // 3. Upload layout/theme.liquid
  console.log('\nUploading layout/theme.liquid...');
  try {
    const filePath = path.join(localThemeDir, 'layout/theme.liquid');
    if (fs.existsSync(filePath)) {
      const val = fs.readFileSync(filePath, 'utf8');
      await uploadToShopify('layout/theme.liquid', val, false);
    }
  } catch (err) {
    console.error('❌ Failed to upload layout/theme.liquid:', err.message);
  }

  console.log('\n--- ALL TASKS COMPLETED SUCCESSFULLY ---');
}

main();
