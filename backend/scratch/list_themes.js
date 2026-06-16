const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function listThemes() {
  const url = `https://${shopDomain}/admin/api/2024-10/themes.json`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      console.log('Themes:', JSON.stringify(data.themes, null, 2));
    } else {
      console.error('Failed to list themes:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

listThemes();
