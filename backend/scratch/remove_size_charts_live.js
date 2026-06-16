const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

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
            title
            products(first: 50) {
              edges {
                node {
                  id
                  title
                  descriptionHtml
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
  const semiFormal = collections.find(c => c.title.toLowerCase().includes('semi formal'));
  if (!semiFormal) {
    console.log("No Semi Formal collection found.");
    return [];
  }
  return semiFormal.products.edges.map(e => e.node);
}

function cleanDescription(html) {
  const regex = /(?:<h2>|<h3>|<h5>|<p>)\s*(?:<strong>)?\s*Size Chart:?\s*(?:<\/strong>)?(?:<br>)?\s*(?:<\/h2>|<\/h3>|<\/h5>|<\/p>)[\s\u00a0]*<table[\s\S]*?<\/table>([\s\u00a0]*<p>[\s\u00a0]*<\/p>)?/gi;
  let newHtml = html.replace(regex, '');
  
  newHtml = newHtml.trim();
  if (newHtml.endsWith('<p>&nbsp;</p>') || newHtml.endsWith('<p> </p>')) {
    newHtml = newHtml.substring(0, newHtml.lastIndexOf('<p>')).trim();
  }
  return newHtml;
}

async function updateProductDescription(product, cleanedHtml) {
  const mutation = `
    mutation updateProductDescription($input: ProductInput!) {
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
  
  const vars = {
    input: {
      id: product.id,
      descriptionHtml: cleanedHtml
    }
  };
  
  const res = await shopifyGql(mutation, vars);
  if (res.errors || res.data.productUpdate.userErrors.length > 0) {
    console.error(`❌ Failed to update description for ${product.title}:`, JSON.stringify(res, null, 2));
  } else {
    console.log(`✅ Successfully removed size chart from "${product.title}" description.`);
  }
}

async function run() {
  const products = await getSemiFormalProducts();
  console.log(`Found ${products.length} products in Semi Formal collection. Commencing update...`);
  
  for (const product of products) {
    if (product.descriptionHtml.includes('<table')) {
      const cleaned = cleanDescription(product.descriptionHtml);
      await updateProductDescription(product, cleaned);
    } else {
      console.log(`- Skipping "${product.title}" (no table found in description).`);
    }
  }
  console.log("All descriptions successfully cleaned!");
}

run();
