const https = require('https');
const fs = require('fs');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const productId = '8292199694595'; // TEXTURE MAROON

// Helper to make HTTPS requests
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: shopDomain,
      path: path,
      method: method,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(data ? JSON.parse(data) : {});
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

// Helper to fetch binary file
function fetchUrlToBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        reject(new Error(`Failed to download image ${url}, status: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Helper to sanitize filenames (e.g. "TEXTURE MAROON" -> "texture-maroon")
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log(`\n=== 🧪 TESTING IMAGE RENAME & RELINK ON PRODUCT ID: ${productId} ===`);
  try {
    // 1. Get Product Details
    const prodRes = await makeRequest(`/admin/api/2024-10/products/${productId}.json`);
    const p = prodRes.product;
    console.log(`Product Title: ${p.title}`);
    
    // We want to map current image IDs to clean up later
    const oldImageIdsToDelete = new Set();
    
    // 2. Loop through variants
    for (const variant of p.variants) {
      const variantTitle = variant.title;
      console.log(`\nProcessing Variant: "${variantTitle}" (ID: ${variant.id})`);
      
      // Find variant's current image
      const imageId = variant.image_id;
      if (!imageId) {
        console.log(`⚠️ No image associated with variant "${variantTitle}". Skipping.`);
        continue;
      }
      
      const imgObject = p.images.find(img => img.id === imageId);
      if (!imgObject || !imgObject.src) {
        console.log(`⚠️ Could not locate image object for ID: ${imageId}. Skipping.`);
        continue;
      }

      const originalUrl = imgObject.src;
      console.log(`Current Image URL: ${originalUrl}`);
      
      // Determine new filename
      // Format: [product-title]-[variant-title].jpg
      const extension = originalUrl.split('.').pop().split('?')[0] || 'jpg';
      const cleanProdTitle = sanitizeFilename(p.title);
      const cleanVarTitle = sanitizeFilename(variantTitle);
      const newFilename = `${cleanProdTitle}-${cleanVarTitle}.${extension}`;
      console.log(`New target filename: "${newFilename}"`);

      // 3. Download the current image to memory buffer
      console.log(`Downloading original image...`);
      const imageBuffer = await fetchUrlToBuffer(originalUrl);
      
      // 4. Upload the image to Shopify with the new filename and associate it with this variant
      console.log(`Uploading renamed image to Shopify...`);
      const uploadPayload = {
        image: {
          attachment: imageBuffer.toString('base64'),
          filename: newFilename,
          variant_ids: [variant.id]
        }
      };
      
      const uploadRes = await makeRequest(`/admin/api/2024-10/products/${productId}/images.json`, 'POST', uploadPayload);
      const newImgObject = uploadRes.image;
      console.log(`✅ Uploaded successfully! New Image ID: ${newImgObject.id}, URL: ${newImgObject.src}`);
      
      // Keep track of the old image ID to delete
      oldImageIdsToDelete.add(imageId);
    }
    
    // 5. Clean up old images
    console.log('\n=== CLEANING UP OLD IMAGES ===');
    for (const oldId of oldImageIdsToDelete) {
      console.log(`Deleting old image ID: ${oldId}...`);
      try {
        await makeRequest(`/admin/api/2024-10/products/${productId}/images/${oldId}.json`, 'DELETE');
        console.log(`✅ Deleted old image ${oldId}`);
      } catch (err) {
        console.error(`❌ Failed to delete old image ${oldId}:`, err.message);
      }
    }
    
    console.log('\n🎉 TEST COMPLETED SUCCESSFULLY! Check Shopify Admin to verify variant images renamed.');
  } catch (err) {
    console.error('❌ Error during execution:', err.message);
  }
}

main();
