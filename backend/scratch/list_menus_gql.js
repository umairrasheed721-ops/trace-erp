const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function listMenusGraphQL() {
  const url = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
  const query = `
    query {
      menus(first: 10) {
        edges {
          node {
            id
            title
            handle
            items {
              title
              url
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

listMenusGraphQL();
