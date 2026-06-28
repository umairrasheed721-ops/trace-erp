const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14;

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

  if (!token) {
    console.error('Login failed');
    return;
  }

  console.log('\n📡 Fetching master costs...');
  const costsRes = await fetch(`${API_BASE}/api/finance/master-costs?store_id=${STORE_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const costs = await costsRes.json();
  
  // Find a candidate where shopify_cost > 0 and unit_cost = 0 or unit_cost != shopify_cost
  const candidate = costs.find(c => c.shopify_cost > 0 && c.unit_cost === 0);
  
  if (!candidate) {
    console.log('No candidate found with shopify_cost > 0 and unit_cost = 0. Checking for unit_cost != shopify_cost...');
    const candidate2 = costs.find(c => c.shopify_cost > 0 && c.unit_cost !== c.shopify_cost);
    if (!candidate2) {
      console.log('No candidates found at all.');
      return;
    }
    runTestWithCandidate(token, candidate2);
  } else {
    runTestWithCandidate(token, candidate);
  }
}

async function runTestWithCandidate(token, candidate) {
  console.log('\n🎯 Found Candidate variant:', {
    parent_title: candidate.parent_title,
    variant_title: candidate.variant_title,
    unit_cost: candidate.unit_cost,
    shopify_cost: candidate.shopify_cost
  });

  // Let's find orders in production containing this product that have cost = 0 or cost is outdated
  console.log(`\n👻 Searching for orders matching candidate: "${candidate.parent_title}"...`);
  const ordersRes = await fetch(`${API_BASE}/api/finance/ghost-product-orders?store_id=${STORE_ID}&name=${encodeURIComponent(candidate.parent_title)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const orders = await ordersRes.json();
  console.log(`Found matching orders: ${orders.length}`);
  if (orders.length === 0) {
    console.log('No ghost orders found for this candidate. Let\'s check history search...');
    // We can still trigger accept-shopify-cost to check if it returns HTTP 200
  } else {
    console.log('Sample order before accept:', JSON.stringify(orders[0]));
  }

  console.log('\n🚀 Triggering POST /api/finance/accept-shopify-cost...');
  const acceptRes = await fetch(`${API_BASE}/api/finance/accept-shopify-cost`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: STORE_ID,
      parent_title: candidate.parent_title,
      variant_title: candidate.variant_title
    })
  });
  
  console.log(`HTTP Status: ${acceptRes.status}`);
  const result = await acceptRes.json();
  console.log('Result:', JSON.stringify(result, null, 2));

  if (acceptRes.ok && result.success) {
    console.log('\n🎉 Cost accepted successfully!');
    if (orders.length > 0) {
      console.log('\n📡 Verifying order cost propagation...');
      const detailsRes = await fetch(`${API_BASE}/api/orders/${orders[0].id}/details`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const updatedOrder = await detailsRes.json();
      console.log('Order cost after accept:', updatedOrder.cost);
      if (updatedOrder.cost > 0) {
        console.log('✅ SUCCESS: Cost propagation is working automatically!');
      } else {
        console.error('❌ FAILURE: Cost did not propagate to the order.');
      }
    }
  } else {
    console.error('❌ Cost accept failed');
  }
}

main().catch(err => console.error(err));
