const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14;
const ORDER_ID = 201919;

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

  // Let's run a test query on production by hitting a diagnostics route or similar, or let's inspect the order details from the API.
  // Wait, does the order query details return fallback_local? Let's check details endpoint
  console.log(`\n📡 Fetching details of order ${ORDER_ID} from production...`);
  const detailsRes = await fetch(`${API_BASE}/api/orders/${ORDER_ID}/details`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const order = await detailsRes.json();
  console.log('Order:', JSON.stringify({
    id: order.id,
    ref_number: order.ref_number,
    cost: order.cost,
    cost_locked: order.cost_locked,
    delivery_status: order.delivery_status,
    line_items: order.line_items
  }, null, 2));

  // Let's fetch catalog
  console.log('\n📡 Fetching master costs...');
  const costRes = await fetch(`${API_BASE}/api/finance/master-costs?store_id=${STORE_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const catalog = await costRes.json();

  console.log('\n🔬 Running simulation...');
  let totalLanded = 0;
  let totalPackaging = 0;
  let matched = false;

  const parsedItems = order.line_items || [];
  console.log('parsedItems count:', parsedItems.length);
  for (const item of parsedItems) {
    const qty = item.quantity || 0;
    if (qty === 0) continue;

    let matchRow = null;
    const vId = item.variant_id ? String(item.variant_id) : '';
    const sku = item.sku ? String(item.sku).trim() : '';

    if (vId || sku) {
      matchRow = catalog.find(c => 
        (vId && c.shopify_variant_id && String(c.shopify_variant_id).includes(vId)) || 
        (sku && c.sku && String(c.sku).trim() === sku)
      );
      if (matchRow) console.log('✅ Matched by ID/SKU:', matchRow.parent_title, '| variant:', matchRow.variant_title, '| landed_cost:', matchRow.landed_cost);
    }

    if (!matchRow && item.title) {
      const pName = item.title.trim();
      const vName = item.variant_title ? item.variant_title.trim() : '';
      
      matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
      if (matchRow) console.log('✅ Matched by direct title');
      
      if (!matchRow) {
        matchRow = catalog.find(c => c.parent_title === pName);
        if (matchRow) console.log('✅ Matched by parent title');
      }
      
      if (!matchRow && vName) {
        const fullSearchTitle1 = `${pName} - ${vName}`;
        const fullSearchTitle2 = `${pName} - ${vName.split('/').map(x => x.trim()).reverse().join(' / ')}`;
        matchRow = catalog.find(c => 
          c.parent_title.trim() === fullSearchTitle1 || 
          c.parent_title.trim() === fullSearchTitle2
        );
        if (matchRow) console.log('✅ Matched by ghost titles');
      }
    }

    if (matchRow) {
      totalLanded += matchRow.landed_cost * qty;
      totalPackaging += (matchRow.packaging_cost || 0) * qty;
      matched = true;
    } else {
      console.log('❌ NO MATCH FOUND for item:', item.title, '| variant:', item.variant_title, '| sku:', item.sku);
    }
  }

  console.log('Result:', { matched, totalLanded, totalPackaging });
}

main().catch(err => console.error(err));
