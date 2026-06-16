const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

async function testFetch() {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Successfully fetched asset list. Total assets: ${data.assets.length}`);
      console.log(`First few assets:`, data.assets.slice(0, 5));
    } else {
      const text = await res.text();
      console.log(`Error body: ${text}`);
    }
  } catch (err) {
    console.error(err);
  }
}

testFetch();
