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

async function debugDescription() {
  const query = `
    query {
      collections(first: 50) {
        edges {
          node {
            title
            products(first: 1) {
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
  if (semiFormal && semiFormal.products.edges.length > 0) {
    const prod = semiFormal.products.edges[0].node;
    console.log(`Product: "${prod.title}"`);
    console.log("------------------- Description HTML -------------------");
    const html = prod.descriptionHtml;
    // Find where table starts
    const tableIndex = html.indexOf('<table');
    if (tableIndex !== -1) {
      console.log("BEFORE TABLE:");
      console.log(html.substring(Math.max(0, tableIndex - 300), tableIndex));
      console.log("TABLE AND AFTER:");
      console.log(html.substring(tableIndex, tableIndex + 200));
      console.log("END OF HTML:");
      console.log(html.substring(html.length - 200));
    } else {
      console.log(html);
    }
  }
}

debugDescription();
