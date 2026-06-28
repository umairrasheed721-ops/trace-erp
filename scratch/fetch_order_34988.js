const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const REF_NUMBER = '#34988';

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
    console.error('❌ Login failed');
    return;
  }

  console.log(`\n📡 Searching for order reference "${REF_NUMBER}" across all stores...`);
  // Let's use GET /api/orders/history-search?name=Ghulam
  const searchRes = await fetch(`${API_BASE}/api/orders/history-search?name=Ghulam.Sarwar`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.orders && searchData.orders.length > 0) {
    console.log('Found orders by name:');
    searchData.orders.forEach(o => {
      console.log(`- ID: ${o.id} | Store: ${o.store_id} | Ref: ${o.ref_number} | Cost: ${o.cost} | Cost Locked: ${o.cost_locked} | Delivery Status: ${o.delivery_status} | Titles: ${o.product_titles}`);
      console.log(`  Line Items: ${o.line_items}`);
    });
  } else {
    console.log('❌ No orders found by name. Let\'s try phone number...');
    const searchRes2 = await fetch(`${API_BASE}/api/orders/history-search?phone=3003072120`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const searchData2 = await searchRes2.json();
    if (searchData2.orders && searchData2.orders.length > 0) {
      searchData2.orders.forEach(o => {
        console.log(`- ID: ${o.id} | Store: ${o.store_id} | Ref: ${o.ref_number} | Cost: ${o.cost} | Cost Locked: ${o.cost_locked} | Delivery Status: ${o.delivery_status} | Titles: ${o.product_titles}`);
        console.log(`  Line Items: ${o.line_items}`);
      });
    } else {
      console.log('❌ No orders found by phone either.');
    }
  }
}

main().catch(err => console.error(err));
