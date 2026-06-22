const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching active products count...');
    const activeProductsRes = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products/count.json?status=active`,
      { headers }
    );
    const activeProductsCount = activeProductsRes.data.count;

    console.log('Fetching all products count...');
    const allProductsRes = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products/count.json`,
      { headers }
    );
    const allProductsCount = allProductsRes.data.count;

    console.log('Fetching smart collections count...');
    const smartCollectionsRes = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/smart_collections/count.json`,
      { headers }
    );
    const smartCollectionsCount = smartCollectionsRes.data.count;

    console.log('Fetching custom collections count...');
    const customCollectionsRes = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/custom_collections/count.json`,
      { headers }
    );
    const customCollectionsCount = customCollectionsRes.data.count;

    console.log('\n======================================');
    console.log('📊 Shopify Store Catalog Report 📊');
    console.log('======================================');
    console.log(`Active Products Count : ${activeProductsCount}`);
    console.log(`Total Products Count  : ${allProductsCount}`);
    console.log(`Smart (Automated) Collections : ${smartCollectionsCount}`);
    console.log(`Custom (Manual) Collections   : ${customCollectionsCount}`);
    console.log(`Total Collections             : ${smartCollectionsCount + customCollectionsCount}`);
    console.log('======================================\n');

  } catch (err) {
    console.error('Error fetching Shopify data:', err.response ? err.response.data : err.message);
  }
}

main();
