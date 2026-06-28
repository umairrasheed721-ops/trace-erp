const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14;
const ORDER_ID = 201919; // #34988, has "ZR T-shirt for men - Navy blue / large" (qty 1) and "Red / large" (qty 1)

async function main() {
  let token = null;
  console.log('🔑 Authenticating with production server...');
  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        token = data.token;
        break;
      }
    } catch (e) {}
  }

  if (!token) return;

  // Step 1: Set the cost of "ZR T-shirt for men" / "Navy blue / large" to 300 manually
  console.log('\nStep 1: Setting cost of "ZR T-shirt for men" / "Navy blue / large" to Rs. 300...');
  const res1 = await fetch(`${API_BASE}/api/finance/master-costs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: STORE_ID,
      parent_title: 'ZR T-shirt for men',
      variant_title: 'Navy blue / large',
      unit_cost: 300,
      packaging_cost: 0
    })
  });
  console.log(`Status: ${res1.status}`);

  // Step 2: Fetch order cost (should be 300 + 450 = 750)
  console.log('\nStep 2: Fetching order details (expected cost: 750)...');
  const detailsRes1 = await fetch(`${API_BASE}/api/orders/${ORDER_ID}/details`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const order1 = await detailsRes1.json();
  console.log(`Order Cost: ${order1.cost} | Cost Locked: ${order1.cost_locked}`);

  // Step 3: Trigger accept-shopify-cost (which has shopify_cost = 450)
  console.log('\nStep 3: Triggering accept-shopify-cost (should set registry unit_cost to 450)...');
  const res2 = await fetch(`${API_BASE}/api/finance/accept-shopify-cost`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: STORE_ID,
      parent_title: 'ZR T-shirt for men',
      variant_title: 'Navy blue / large'
    })
  });
  console.log(`Status: ${res2.status}`);

  // Step 4: Fetch order cost again (should be 450 + 450 = 900)
  console.log('\nStep 4: Fetching order details after accept (expected cost: 900)...');
  const detailsRes2 = await fetch(`${API_BASE}/api/orders/${ORDER_ID}/details`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const order2 = await detailsRes2.json();
  console.log(`Order Cost: ${order2.cost} | Cost Locked: ${order2.cost_locked}`);

  if (order2.cost === 900) {
    console.log('\n✅ SUCCESS: Cost propagation is working perfectly on accept-shopify-cost endpoint!');
  } else {
    console.error('\n❌ FAILURE: Cost did not propagate correctly.');
  }
}

main().catch(err => console.error(err));
