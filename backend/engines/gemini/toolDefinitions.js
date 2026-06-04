const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'getOrderStatus',
        description: 'Get the live tracking number, courier name, delivery status, and verification status for a customer phone number.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'The 10 or 12 digit phone number of the customer.' }
          },
          required: ['phone']
        }
      },
      {
        name: 'checkProductStock',
        description: 'Check live inventory availability, SKU, and unit price for a product title or keyword.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_title: { type: 'STRING', description: 'The title, variant, or keyword of the product.' }
          },
          required: ['product_title']
        }
      },
      {
        name: 'createDraftOrder',
        description: 'Autonomously create a verified Draft order in the ERP when a customer requests to place a new order.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customer_name: { type: 'STRING', description: 'Full name of the customer.' },
            phone: { type: 'STRING', description: 'Customer phone number.' },
            address: { type: 'STRING', description: 'Complete delivery street address.' },
            city: { type: 'STRING', description: 'Delivery city.' },
            product_sku_or_title: { type: 'STRING', description: 'SKU or title of the product they wish to buy.' },
            price: { type: 'NUMBER', description: 'Total agreed price.' }
          },
          required: ['customer_name', 'phone', 'address', 'city', 'product_sku_or_title', 'price']
        }
      },
      {
        name: 'updateCustomerProfile',
        description: 'Save persistent customer preferences, sizing, or delivery instructions into their long-term profile.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Customer phone number.' },
            preference_key: { type: 'STRING', description: 'Key of the preference (e.g., preferred_size, delivery_time, special_notes).' },
            preference_value: { type: 'STRING', description: 'Value of the preference.' }
          },
          required: ['phone', 'preference_key', 'preference_value']
        }
      },
      {
        name: 'fetchCatalog',
        description: 'Fetch the available product catalog, sizing recommendations, and product images matching a specific size.',
        parameters: {
          type: 'OBJECT',
          properties: {
            size: { type: 'STRING', description: 'The requested size (e.g. M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL).' }
          },
          required: ['size']
        }
      },
      {
        name: 'getMatchingRecommendations',
        description: 'Get automated matching product recommendations (e.g., pairs shirts with cargo pants) to cross-sell to the customer in their preferred size.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_sku_or_title: { type: 'STRING', description: 'SKU or title of the product they are looking at or ordering.' },
            size: { type: 'STRING', description: 'Preferred size (e.g., M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL).' }
          },
          required: ['product_sku_or_title', 'size']
        }
      }
    ]
  }
];

module.exports = { geminiTools };
