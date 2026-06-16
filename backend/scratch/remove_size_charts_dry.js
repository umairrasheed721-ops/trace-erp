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
  // Regex to remove Size Chart heading and table
  // Looks for <h2>, <h3>, or <p> with "Size Chart:" or "Size Chart" followed by a <table>
  const regex = /(?:<h2>|<h3>|<h5>|<p>)\s*(?:<strong>)?\s*Size Chart:?\s*(?:<\/strong>)?(?:<br>)?\s*(?:<\/h2>|<\/h3>|<\/h5>|<\/p>)[\s\u00a0]*<table[\s\S]*?<\/table>([\s\u00a0]*<p>[\s\u00a0]*<\/p>)?/gi;
  
  let newHtml = html.replace(regex, '');
  
  // Also clean up trailing non-breaking space paragraph if any left over
  newHtml = newHtml.trim();
  if (newHtml.endsWith('<p>&nbsp;</p>') || newHtml.endsWith('<p> </p>')) {
    newHtml = newHtml.substring(0, newHtml.lastIndexOf('<p>')).trim();
  }
  
  return newHtml;
}

async function dryRun() {
  const products = await getSemiFormalProducts();
  console.log(`Found ${products.length} products in Semi Formal collection.`);
  
  for (const product of products) {
    const original = product.descriptionHtml;
    const cleaned = cleanDescription(original);
    
    if (original.includes('<table')) {
      console.log(`\n======================================================`);
      console.log(`Product: "${product.title}"`);
      console.log(`Original length: ${original.length} | Cleaned length: ${cleaned.length}`);
      console.log(`Contains table before: ${original.includes('<table')} | after: ${cleaned.includes('<table')}`);
      
      // Print the last 150 chars of cleaned description to make sure it looks complete and correct
      console.log("Cleaned tail (last 150 chars):");
      console.log(cleaned.substring(Math.max(0, cleaned.length - 200)));
    } else {
      console.log(`Product: "${product.title}" does not contain a table in description.`);
    }
  }
}

dryRun();
