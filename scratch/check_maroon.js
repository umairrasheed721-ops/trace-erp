const https = require('https');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const productId = '8292199694595'; // TEXTURE MAROON

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: shopDomain,
      path: path,
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status: ${res.statusCode}, Body: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log(`--- DIAGNOSING PRODUCT: TEXTURE MAROON (ID: ${productId}) ---`);
  try {
    // 1. Fetch Product Options and Details
    const prodData = await makeRequest(`/admin/api/2024-10/products/${productId}.json`);
    const p = prodData.product;
    console.log(`Title: ${p.title}`);
    console.log(`Handle: ${p.handle}`);
    console.log(`Tags: ${p.tags}`);
    console.log(`Options:`, JSON.stringify(p.options, null, 2));
    console.log(`Variants count: ${p.variants.length}`);
    console.log(`Variants options sample:`, p.variants.slice(0, 3).map(v => ({ id: v.id, title: v.title, option1: v.option1, option2: v.option2 })));

    // 2. Fetch Product Metafields
    const mfData = await makeRequest(`/admin/api/2024-10/products/${productId}/metafields.json`);
    console.log('\n--- METAFIELDS ---');
    if (mfData.metafields.length === 0) {
      console.log('No metafields defined for this product.');
    } else {
      mfData.metafields.forEach(m => {
        console.log(`Key: ${m.namespace}.${m.key}`);
        console.log(`Value: ${m.value}`);
        console.log('---');
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
