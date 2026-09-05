const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const axios = require('axios');

const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

async function createMetafieldDefinition(shopDomain, accessToken, name, key, description) {
  const query = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
          type { name }
        }
        userErrors { field message }
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
      data: { query, variables }
    });

    const data = res.data;
    if (data.errors) {
      console.error(`❌ GraphQL Errors on ${shopDomain} for ${key}:`, data.errors);
      return;
    }

    const result = data.data.metafieldDefinitionCreate;
    if (result.userErrors && result.userErrors.length > 0) {
      console.log(`⚠️ Note on ${shopDomain} for ${key}:`, result.userErrors[0].message);
    } else if (result.createdDefinition) {
      console.log(`✅ Successfully created definition on ${shopDomain}: ${result.createdDefinition.name} (custom.${result.createdDefinition.key})`);
    }
  } catch (err) {
    console.error(`❌ Error on ${shopDomain} for ${key}:`, err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

async function main() {
  const stmt = db.prepare("SELECT id, shop_domain, store_name, access_token FROM stores WHERE access_token IS NOT NULL AND access_token != 'PENDING'");
  const stores = stmt.all();
  console.log(`🚀 Found ${stores.length} connected stores. Registering 'custom.cod_only' Metafield Definition...`);
  
  for (const store of stores) {
    console.log(`\n📌 Store: ${store.store_name} (${store.shop_domain})`);
    await createMetafieldDefinition(store.shop_domain, store.access_token, 'COD Only', 'cod_only', 'Disable Advance Payment and allow Cash on Delivery only');
    await createMetafieldDefinition(store.shop_domain, store.access_token, 'Advance Only', 'advance_only', 'Require 100% advance payment');
  }
  console.log('\n🎉 Metafield registration process complete!');
}

main().catch(err => console.error('Fatal error:', err));
