const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const targetProductId = '8307671302403'; // "Multi ref Pro-active"

async function makeGraphQLRequest(query, variables = {}) {
  const url = `https://${shopDomain}/admin/api/2024-10/graphql`;
  try {
    const res = await axios.post(url, { query, variables }, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    return res.data;
  } catch (err) {
    console.error('GraphQL Request Error:', err.response ? err.response.data : err.message);
    throw err;
  }
}

async function createMetafieldDefinition() {
  console.log('检查/创建 metafield 定义 (custom.redirect_product)...');
  const mutation = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
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
      name: "Redirect Product",
      namespace: "custom",
      key: "redirect_product",
      ownerType: "PRODUCT",
      type: "product_reference",
      description: "Select the main product page where the customer should land when clicking this dummy/bundle card."
    }
  };

  const data = await makeGraphQLRequest(mutation, variables);
  if (data.errors) {
    console.log('GraphQL errors:', JSON.stringify(data.errors));
  }
  const result = data.data && data.data.metafieldDefinitionCreate;
  if (result) {
    if (result.userErrors && result.userErrors.length > 0) {
      console.log('Metafield definition status:', result.userErrors[0].message);
    } else if (result.createdDefinition) {
      console.log('✅ Created Metafield Definition:', result.createdDefinition.name);
    }
  }
}

async function createDummyProduct() {
  const url = `https://${shopDomain}/admin/api/2024-10/products.json`;
  const payload = {
    product: {
      title: "Multi ref Pro-active (Buy in Bundle)",
      body_html: "<p>Select sizes and colors on the next page.</p>",
      vendor: "Trace",
      product_type: "Bundle",
      status: "active",
      variants: [
        {
          price: "2499.00",
          sku: "dummy-bundle-pro-active",
          inventory_management: null
        }
      ]
    }
  };

  console.log('Creating dummy product...');
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log('Product API response:', res.data);
    return res.data ? res.data.product : null;
  } catch (err) {
    console.error('Error creating product:', err.response ? err.response.data : err.message);
    throw err;
  }
}

async function setRedirectMetafield(productId, targetId) {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}/metafields.json`;
  const payload = {
    metafield: {
      namespace: "custom",
      key: "redirect_product",
      value: `gid://shopify/Product/${targetId}`,
      type: "product_reference"
    }
  };

  console.log(`Setting redirect metafield for product ${productId} to target ${targetId}...`);
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Metafield successfully set!', res.data.metafield.value);
  } catch (err) {
    console.error('Error setting metafield:', err.response ? err.response.data : err.message);
    throw err;
  }
}

async function main() {
  try {
    // 1. Create metafield definition
    await createMetafieldDefinition();

    // 2. Create the dummy product
    const product = await createDummyProduct();
    console.log(`✅ Dummy Product Created! ID: ${product.id}, Handle: ${product.handle}`);

    // 3. Set the redirect metafield
    await setRedirectMetafield(product.id, targetProductId);

    console.log('🎉 Setup successfully completed!');
  } catch (err) {
    console.error('❌ Failed Setup:', err.message);
  }
}

main();
