#!/usr/bin/env node
/**
 * Direct Railway API mass-resync for all Pending orders
 * Iterates all stores, finds pending orders, calls resync for each
 */

const BASE = 'https://trace-erp-production.up.railway.app';

async function run() {
  // 1. Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const { token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Get stores
  const storesRes = await fetch(`${BASE}/api/stores`, { headers });
  const stores = await storesRes.json();
  console.log(`Found ${stores.length} stores: ${stores.map(s => s.id + ':' + s.shop_domain).join(', ')}`);

  // 3. For each store, get all pending orders
  for (const store of stores) {
    console.log(`\n=== Store ${store.id} (${store.shop_domain}) ===`);
    const res = await fetch(`${BASE}/api/orders?store_id=${store.id}&status=Pending&limit=200`, { headers });
    const data = await res.json();
    const orders = (data.orders || []).filter(o => !o.tracking_number || o.tracking_number === '');
    console.log(`  Pending with no tracking: ${orders.length}`);
    
    let updated = 0, failed = 0;
    for (const order of orders) {
      if (!order.id || !order.shopify_order_id) { failed++; continue; }
      try {
        const r = await fetch(`${BASE}/api/orders/${order.id}/resync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ store_id: store.id })
        });
        const result = await r.json();
        if (r.ok) {
          const newStatus = result.order?.delivery_status || result.delivery_status || '?';
          const newTracking = result.order?.tracking_number || result.tracking_number || '';
          console.log(`  ✅ ${order.ref_number} -> Status: ${newStatus}, Tracking: ${newTracking || 'none'}`);
          updated++;
        } else {
          console.log(`  ⚠️  ${order.ref_number} -> ${JSON.stringify(result).substring(0, 100)}`);
          failed++;
        }
      } catch (e) {
        console.log(`  ❌ ${order.ref_number} -> ${e.message}`);
        failed++;
      }
      // Throttle: 300ms between requests
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`  Done: ${updated} updated, ${failed} failed`);
  }

  // 4. Final verification - check TR33298
  console.log('\n=== FINAL VERIFY TR33298 ===');
  const verRes = await fetch(`${BASE}/api/orders?store_id=12&search=TR33298&limit=5`, { headers });
  const verData = await verRes.json();
  const tr = (verData.orders || [])[0];
  if (tr) {
    console.log(`TR33298 | Status: ${tr.delivery_status} | Tracking: ${tr.tracking_number} | Courier: ${tr.courier}`);
  } else {
    console.log('TR33298 not found in search');
  }
}

run().catch(console.error);
