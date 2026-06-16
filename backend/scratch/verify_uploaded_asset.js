const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function checkAsset() {
  const key = 'sections/custom-hero-slider.liquid';
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const { asset } = await res.json();
      console.log('Successfully retrieved asset from Shopify!');
      
      // Let's check if it contains "Desktop Styles"
      if (asset.value.includes('Desktop Styles')) {
        console.log('✅ The asset in Shopify DOES contain the new Desktop Styles!');
      } else {
        console.log('❌ The asset in Shopify DOES NOT contain the new Desktop Styles!');
      }
      
      // Let's check the size
      console.log(`Asset size in Shopify: ${asset.value.length} characters`);
    } else {
      const text = await res.text();
      console.error(`Failed to get asset. Status: ${res.status}, Body: ${text}`);
    }
  } catch (err) {
    console.error('Error getting asset:', err);
  }
}

checkAsset();
