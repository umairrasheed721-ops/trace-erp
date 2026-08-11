const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function createMetafieldDefinition(name, key, description) {
  const query = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
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
        }
      }
    }
  `;

  const variables = {
    definition: {
      name: name,
      namespace: 'custom',
      key: key,
      type: 'boolean',
      ownerType: 'PRODUCT',
      description: description
    }
  };

  try {
    const res = await axios({
      url: `https://${shopDomain}/admin/api/2024-10/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      data: {
        query: query,
        variables: variables
      }
    });

    const data = res.data;
    if (data.errors) {
      console.error(`❌ GraphQL Errors for ${key}:`, data.errors);
      return;
    }

    const result = data.data.metafieldDefinitionCreate;
    if (result.userErrors && result.userErrors.length > 0) {
      console.log(`⚠️ User Errors for ${key}:`, result.userErrors);
    } else if (result.createdDefinition) {
      console.log(`✅ Successfully created definition: ${result.createdDefinition.name} (${result.createdDefinition.namespace}.${result.createdDefinition.key})`);
    }
  } catch (err) {
    console.error(`❌ Axios Error for ${key}:`, err.response ? err.response.data : err.message);
  }
}

async function main() {
  console.log('🚀 Creating Shopify Product Metafield Definitions...');
  await createMetafieldDefinition('Hide Bundles', 'hide_bundles', 'Hide package bundle deals for this product');
  await createMetafieldDefinition('Advance Only', 'advance_only', 'Disable Cash on Delivery and require Advance Payment');
  console.log('🎉 Done!');
}

main();
