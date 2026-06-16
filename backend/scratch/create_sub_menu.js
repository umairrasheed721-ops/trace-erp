const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function createSubMenu() {
  const url = `https://${shopDomain}/admin/api/2024-10/graphql.json`;
  
  const mutation = `
    mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    title: "Sub Header Menu",
    handle: "sub-header-menu",
    items: [
      {
        title: "Winter",
        type: "HTTP",
        url: "/collections/hoodies"
      },
      {
        title: "Semi Formal",
        type: "HTTP",
        url: "/collections/semi-casual"
      },
      {
        title: "Tracksuits & Hoodies",
        type: "HTTP",
        url: "/collections/hoodies"
      },
      {
        title: "Deals",
        type: "HTTP",
        url: "/collections/deals"
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

createSubMenu();
