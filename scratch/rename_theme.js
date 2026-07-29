const axios = require('axios');

async function main() {
  const shopDomain = 'tracepk.com';
  const accessToken = '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';
  const themeId = '159705432323';
  const newName = 'umair Trace theme';

  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}.json`;
  
  const payload = {
    theme: {
      id: themeId,
      name: newName
    }
  };

  console.log(`Renaming theme ${themeId} to "${newName}" on Shopify...`);
  
  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200) {
      console.log(`✅ Successfully renamed theme! New Name: "${res.data.theme.name}"`);
    } else {
      console.error(`❌ Failed to rename theme. Status: ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Error renaming theme:', err.response ? err.response.data : err.message);
  }
}

main();
