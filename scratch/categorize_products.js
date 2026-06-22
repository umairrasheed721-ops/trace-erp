const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

const categoryMapping = {
  // Polo Shirts
  8285438378243: 'Polo Shirt', // A | X Embroidery LOGO
  8894057382147: 'Polo Shirt', // Popcorn Polo

  // T-Shirts
  8308480377091: 'T-Shirt',    // A-D Multi Ref Stripes
  8285440442627: 'T-Shirt',    // ADI - EMBOSSED LOGO
  8629309505795: 'T-Shirt',    // Basic RL Crew- Cotton
  8810105962755: 'T-Shirt',    // Basic RL Crew- Plus Size
  8297865478403: 'T-Shirt',    // Embossed NIK-E
  8307671302403: 'T-Shirt',    // Multi ref Pro-active
  8292283515139: 'T-Shirt',    // NIK- Ref LOGO
  9161752903939: 'T-Shirt',    // N_F Branded Dri-Fit  T-shirt
  8292282827011: 'T-Shirt',    // Silver Ref Stripes
  8877332660483: 'T-Shirt',    // Tipping Crew

  // Trousers
  8296437547267: 'Trouser',    // ADI-Trouser Tri strip
  8900117299459: 'Trouser',    // Imported Scoba Executive Adi Tro
  9224595276035: 'Trouser',    // Multi-ref-ADI Trouser winter

  // Casual Shirts
  8292197695747: 'Casual Shirt', // TEXTURE BLACK
  8292197269763: 'Casual Shirt', // TEXTURE LIGHT SKY
  8292199694595: 'Casual Shirt', // TEXTURE MAROON
  8292189012227: 'Casual Shirt', // TEXTURE NAVY
  8292197335299: 'Casual Shirt'  // TEXTURE WHITE
};

async function updateProductType(productId, newType) {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`;
  const payload = {
    product: {
      id: productId,
      product_type: newType
    }
  };

  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    if (res.status === 200) {
      console.log(`✅ Updated "${res.data.product.title}" to category "${newType}"`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Failed to update product ${productId}:`, err.response ? err.response.data : err.message);
  }
  return false;
}

async function main() {
  console.log('Starting product categorization...');
  for (const [id, type] of Object.entries(categoryMapping)) {
    await updateProductType(id, type);
    // Be nice to the API rate limit (Shopify limit: 2 requests/second)
    await new Promise(resolve => setTimeout(resolve, 550));
  }
  console.log('\nFinished categorizing all active products!');
}

main();
