const axios = require('axios');

async function main() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';

  const url = `https://${shopDomain}/admin/api/2024-10/themes.json`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    console.log('Themes found:');
    for (const theme of res.data.themes) {
      console.log(`- ID: ${theme.id}, Name: "${theme.name}", Role: "${theme.role}"`);
    }
  } catch (err) {
    console.error('Error fetching themes:', err.response ? err.response.data : err.message);
  }
}

main();
