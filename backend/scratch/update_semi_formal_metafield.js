const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const fileId = 'gid://shopify/MediaImage/43195927855363';

async function shopifyGql(query, variables = {}) {
  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

async function getSemiFormalProducts() {
  const query = `
    query {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            products(first: 50) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      }
    }
  `;
  const res = await shopifyGql(query);
  const collections = res.data.collections.edges.map(e => e.node);
  const semiFormal = collections.find(c => c.title.toLowerCase().includes('semi formal') || c.handle.toLowerCase().includes('semi-formal'));
  if (!semiFormal) {
    console.log("Could not find collection containing 'Semi Formal' in title or handle.");
    console.log("Available collections are:");
    collections.forEach(c => console.log(`- ${c.title} (handle: ${c.handle})`));
    return null;
  }
  console.log(`Found collection: "${semiFormal.title}"`);
  return semiFormal.products.edges.map(e => e.node);
}

async function updateProductMetafields(products) {
  const mutation = `
    mutation updateProductMetafield($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const product of products) {
    console.log(`Updating size_chart metafield for product: "${product.title}"...`);
    const vars = {
      input: {
        id: product.id,
        metafields: [
          {
            namespace: "custom",
            key: "size_chart",
            value: fileId,
            type: "file_reference"
          }
        ]
      }
    };
    const res = await shopifyGql(mutation, vars);
    if (res.errors || res.data.productUpdate.userErrors.length > 0) {
      console.error(`❌ Failed to update metafield for ${product.title}:`, JSON.stringify(res, null, 2));
    } else {
      console.log(`✅ Successfully updated ${product.title}!`);
    }
  }
}

async function run() {
  const products = await getSemiFormalProducts();
  if (!products || products.length === 0) {
    console.log("No products found to update.");
    return;
  }
  await updateProductMetafields(products);
  console.log("Finished linking size chart!");
}

run();
