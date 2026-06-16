const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function listMenus() {
  const url = `https://${shopDomain}/admin/api/2024-10/pages.json`; // Pages endpoint as fallback test
  const menuUrl = `https://${shopDomain}/admin/api/2024-10/navigation/menus.json`; // Navigation menu endpoint (usually GraphQL is preferred, but let's see REST)
  const linkListsUrl = `https://${shopDomain}/admin/api/2024-10/link_lists.json`;

  try {
    const res = await fetch(linkListsUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

listMenus();
