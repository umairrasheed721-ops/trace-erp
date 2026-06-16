const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const themeId = '159705432323';

const filesToDelete = [
  'templates/product.advance-funnel.json',
  'templates/product.color-deal.json'
];

async function deleteAsset(key) {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  console.log(`Deleting ${key} from Shopify theme ${themeId}...`);
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      console.log(`✅ Successfully deleted ${key} from Shopify!`);
    } else {
      const text = await res.text();
      console.error(`❌ Failed to delete ${key}. Status: ${res.status}, Body: ${text}`);
    }
  } catch (err) {
    console.error(`Error deleting ${key}:`, err);
  }
}

async function run() {
  for (const file of filesToDelete) {
    await deleteAsset(file);
  }
  console.log('Finished deletion process!');
}

run();
