const shopDomain = 'tracepk.com';
const accessToken = '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';
const SHOPIFY_API_VERSION = '2024-10';

async function testOrder() {
  const orderPayload = {
    order: {
      source_name: 'web',
      landing_site: '/products/test',
      referring_site: 'https://facebook.com',
      email: 'test_pixel_audit@tracepk.com',
      phone: '+923009998877',
      line_items: [
        {
          variant_id: 48981440463139,
          quantity: 1,
          price: "100"
        }
      ],
      shipping_address: {
        first_name: 'Test',
        last_name: 'User',
        address1: 'Test Address',
        city: 'Karachi',
        country: 'Pakistan',
        country_code: 'PK',
        phone: '+923009998877'
      },
      financial_status: 'pending',
      gateway: 'Cash on Delivery (COD)',
      send_receipt: false,
      inventory_behaviour: 'bypass'
    }
  };

  const response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    }
  );

  const text = await response.text();
  console.log('STATUS:', response.status);
  if (response.status !== 201) {
    console.log('ERROR RESPONSE:', text);
  } else {
    console.log('SUCCESS! Order created via API!');
  }
}

testOrder();
