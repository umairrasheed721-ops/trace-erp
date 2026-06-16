const fetch = require('node-fetch');

async function createMetafieldDefinition() {
  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';

  const query = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          key
          namespace
          type {
            name
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    definition: {
      name: "Linked Color Products",
      namespace: "custom",
      key: "linked_color_products",
      ownerType: "PRODUCT",
      type: "list.product_reference",
      description: "List of other color listing products linked to this product"
    }
  };

  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    
    const data = await res.json();
    console.log("Response from Shopify:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error calling Shopify API:", err);
  }
}

createMetafieldDefinition();
