const shopDomain = 'tracepk.com';

async function testSections() {
  const url = `https://${shopDomain}/products/a-x-embroidery-logo?sections=cart-drawer,cart-icon-bubble`;
  try {
    const res = await fetch(url, {
      headers: {
        // No Accept header
      }
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response snippet (first 500 chars):`, text.substring(0, 500));
    try {
      const data = JSON.parse(text);
      console.log(`Keys in JSON:`, Object.keys(data));
      if (data['cart-drawer']) {
        console.log(`cart-drawer HTML snippet (first 200 chars):`, data['cart-drawer'].substring(0, 200));
      } else {
        console.log(`❌ cart-drawer key NOT found in response!`);
      }
    } catch (e) {
      console.log(`Failed to parse response as JSON. Error:`, e.message);
    }
  } catch (err) {
    console.error(err);
  }
}

testSections();
