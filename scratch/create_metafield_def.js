const fetch = require('node-fetch');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function createMetafieldDefinition() {
  console.log(`📡 Connecting to Shopify GraphQL API for ${shopDomain}...`);

  const mutation = `
    mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
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

  // First try file_reference type (allows uploading MP4/WebM video file directly)
  const variables = {
    definition: {
      name: "Product Video",
      namespace: "custom",
      key: "product_video",
      type: "file_reference",
      ownerType: "PRODUCT",
      description: "Product video file or URL for View Video modal button"
    }
  };

  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));

    if (json.data && json.data.metafieldDefinitionCreate) {
      const { createdDefinition, userErrors } = json.data.metafieldDefinitionCreate;
      if (userErrors && userErrors.length > 0) {
        console.log('⚠️ User Errors:', userErrors);
        // If file_reference error, try url type
        if (userErrors.some(e => e.message.includes('taken') || e.message.includes('exists'))) {
          console.log('✅ Metafield definition custom.product_video already exists on Shopify Admin!');
        } else {
          console.log('🔄 Retrying with url type...');
          variables.definition.type = "url";
          const res2 = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: mutation, variables })
          });
          const json2 = await res2.json();
          console.log('Retry Response:', JSON.stringify(json2, null, 2));
        }
      } else if (createdDefinition) {
        console.log('🎉 Successfully created Metafield Definition custom.product_video on Shopify Admin:', createdDefinition);
      }
    }
  } catch (err) {
    console.error('❌ Failed to execute GraphQL mutation:', err);
  }
}

createMetafieldDefinition();
