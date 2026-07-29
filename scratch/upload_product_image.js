const fs = require('fs');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const productId = '9565481009411';
const imagePath = '/Users/umairrasheed/.gemini/antigravity-ide/brain/d3ac1aaa-6fef-45dd-a9c4-deb31bcd2ed4/multi_ref_bundle_deal_1785286633293.png';

async function main() {
  console.log(`Reading generated image from ${imagePath}...`);
  if (!fs.existsSync(imagePath)) {
    console.error('❌ Image file does not exist locally.');
    return;
  }

  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');

  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}/images.json`;
  const payload = {
    image: {
      attachment: base64Image,
      filename: 'multi_ref_bundle_deal.png'
    }
  };

  console.log(`Uploading image to Shopify Product ID ${productId}...`);
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 201 || res.status === 200) {
      console.log('✅ Image uploaded successfully to Shopify!', res.data.image.src);
    } else {
      console.error('❌ Failed to upload image. Status:', res.status);
    }
  } catch (err) {
    console.error('❌ Error uploading image:', err.response ? err.response.data : err.message);
  }
}

main();
