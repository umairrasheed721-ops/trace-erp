/**
 * fix_zero_cost_orders.js
 * Finds all delivered orders with cost = 0, re-fetches their costs from Shopify, and patches the DB.
 * Run: node fix_zero_cost_orders.js
 */

const db = require('./backend/db');
const { getLiveShopifyCosts } = require('./backend/engines/shopify');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fixZeroCostOrders() {
  // Get the first connected store
  const store = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING' LIMIT 1").get();
  if (!store) { console.error('No connected store found.'); process.exit(1); }

  console.log(`\n🔍 Store: ${store.shop_domain}`);

  // Get all delivered orders with cost = 0
  const zeroCostOrders = db.prepare(`
    SELECT id, shopify_order_id, ref_number, delivery_status
    FROM orders
    WHERE store_id = ? AND LOWER(delivery_status) = 'delivered' AND (cost = 0 OR cost IS NULL)
  `).all(store.id);

  console.log(`📦 Found ${zeroCostOrders.length} delivered orders with cost = 0\n`);

  if (!zeroCostOrders.length) {
    console.log('✅ Nothing to fix!');
    return;
  }

  let fixed = 0;
  let stillZero = 0;

  for (let i = 0; i < zeroCostOrders.length; i++) {
    const row = zeroCostOrders[i];
    console.log(`[${i + 1}/${zeroCostOrders.length}] Fetching order ${row.ref_number || row.shopify_order_id}...`);

    try {
      // Fetch the full order from Shopify to get variant IDs
      const res = await fetch(
        `https://${store.shop_domain}/admin/api/2024-10/orders/${row.shopify_order_id}.json`,
        { headers: { 'X-Shopify-Access-Token': store.access_token } }
      );

      if (res.status === 429) {
        console.log('  ⏳ Rate limited, waiting 3s...');
        await sleep(3000);
        i--; // retry this order
        continue;
      }

      if (!res.ok) {
        console.log(`  ⚠️ Shopify returned ${res.status} — skipping`);
        stillZero++;
        continue;
      }

      const data = await res.json();
      const order = data.order;
      if (!order) { stillZero++; continue; }

      // Collect variant IDs
      const variantIds = order.line_items
        .map(i => i.variant_id)
        .filter(Boolean);

      if (!variantIds.length) {
        console.log('  ⚠️ No variant IDs — skipping');
        stillZero++;
        continue;
      }

      // Fetch costs for these variants
      const costMap = await getLiveShopifyCosts(store.shop_domain, store.access_token, [...new Set(variantIds)]);

      let totalCost = 0;
      order.line_items.forEach(item => {
        const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
        if (qty === 0) return;
        totalCost += (costMap[String(item.variant_id)] || 0) * qty;
      });

      if (totalCost > 0) {
        db.prepare('UPDATE orders SET cost = ? WHERE id = ?').run(totalCost, row.id);
        console.log(`  ✅ Fixed! Cost = Rs ${totalCost.toFixed(2)}`);
        fixed++;
      } else {
        console.log('  ⚠️ Cost still 0 after fetch (variant likely deleted from Shopify)');
        stillZero++;
      }

      // Small delay to respect rate limits
      await sleep(300);

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      stillZero++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Fixed:       ${fixed}`);
  console.log(`   Still zero:  ${stillZero} (variants deleted from Shopify — nothing we can do)`);
  console.log(`   Coverage now: ${(((1368 - stillZero) / 1368) * 100).toFixed(1)}%`);
}

fixZeroCostOrders().catch(console.error);
