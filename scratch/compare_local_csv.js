const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'orders.csv');
const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  // Find header row or use first row
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('order id') || lines[i].toLowerCase().includes('orderid')) {
      headerIndex = i;
      break;
    }
  }
  
  const headers = lines[headerIndex].split(/[\t,]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  const idIdx = headers.indexOf('order id') !== -1 ? headers.indexOf('order id') : headers.indexOf('orderid');
  const refIdx = headers.indexOf('reference') !== -1 ? headers.indexOf('reference') : (headers.indexOf('ref') !== -1 ? headers.indexOf('ref') : headers.indexOf('refrance number'));
  const priceIdx = headers.indexOf('sale price') !== -1 ? headers.indexOf('sale price') : headers.indexOf('price');
  const costIdx = headers.indexOf('shopify cost') !== -1 ? headers.indexOf('shopify cost') : headers.indexOf('cost');
  const statusIdx = headers.indexOf('delivery status') !== -1 ? headers.indexOf('delivery status') : headers.indexOf('status');
  const titlesIdx = headers.indexOf('product titles') !== -1 ? headers.indexOf('product titles') : headers.indexOf('product');

  console.log(`🔍 Parsed CSV Headers: ${headers.join(' | ')}`);
  console.log(`Indices -> ID: ${idIdx}, Ref: ${refIdx}, Price: ${priceIdx}, Cost: ${costIdx}, Status: ${statusIdx}`);

  const orders = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split(/[\t,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= Math.max(idIdx, refIdx, priceIdx, costIdx)) continue;
    
    const id = cols[idIdx];
    const ref = cols[refIdx];
    const price = parseFloat(cols[priceIdx].replace(/,/g, '')) || 0;
    const cost = parseFloat(cols[costIdx].replace(/,/g, '')) || 0;
    const status = cols[statusIdx] || '';
    const titles = cols[titlesIdx] || '';
    
    // Only process delivered orders
    if (status.toLowerCase().includes('deliver')) {
      orders.push({ id, ref, price, cost, status, titles });
    }
  }
  return orders;
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Please export the 'Audit_Jan_2026' sheet or 'Orders' sheet as CSV and save it at: ${csvPath}`);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const sheetOrders = parseCsv(csvContent);
  console.log(`📊 Loaded ${sheetOrders.length} Delivered orders from CSV.`);

  let token = null;
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
    console.error('❌ Could not authenticate with production ERP API.');
    return;
  }

  console.log(`🔐 Authenticated with production ERP.`);

  // Fetch orders for Store ID 12 in Jan 2026
  const url = `${API_BASE}/api/orders?store_id=12&start_date=2026-01-01&end_date=2026-01-31&status=delivered&limit=1000`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!res.ok) {
    console.error(`❌ Failed to fetch ERP orders:`, res.status, await res.text());
    return;
  }

  const resData = await res.json();
  const erpOrders = resData.orders || [];
  console.log(`📡 Loaded ${erpOrders.length} Delivered orders from production ERP.`);

  // Compare
  const sheetMap = {};
  sheetOrders.forEach(o => { sheetMap[String(o.id)] = o; });

  const erpMap = {};
  erpOrders.forEach(o => { erpMap[String(o.shopify_order_id)] = o; });

  const mismatches = [];
  const onlyInSheet = [];
  const onlyInErp = [];

  sheetOrders.forEach(sh => {
    const idStr = String(sh.id);
    const erp = erpMap[idStr];
    if (!erp) {
      onlyInSheet.push(sh);
    } else {
      const costDiff = sh.cost - erp.cost;
      const priceDiff = sh.price - erp.price;
      if (Math.abs(costDiff) > 1 || Math.abs(priceDiff) > 1) {
        mismatches.push({
          id: sh.id,
          ref: sh.ref,
          titles: sh.titles,
          sheetPrice: sh.price,
          erpPrice: erp.price,
          sheetCost: sh.cost,
          erpCost: erp.cost,
          costDiff
        });
      }
    }
  });

  erpOrders.forEach(erp => {
    const idStr = String(erp.shopify_order_id);
    if (!sheetMap[idStr]) {
      onlyInErp.push(erp);
    }
  });

  console.log("\n==================================================");
  console.log("📊 COMPARISON RESULTS");
  console.log("==================================================");
  console.log(`- Mismatching Cost/Price: ${mismatches.length}`);
  console.log(`- Only in Sheet: ${onlyInSheet.length}`);
  console.log(`- Only in ERP: ${onlyInErp.length}`);

  if (mismatches.length > 0) {
    console.log("\n❌ COST/PRICE MISMATCHES:");
    mismatches.sort((a,b) => Math.abs(b.costDiff) - Math.abs(a.costDiff));
    mismatches.forEach(m => {
      console.log(`Order ID: ${m.id} | Ref: ${m.ref}`);
      console.log(`  Titles: ${m.titles}`);
      console.log(`  Price -> Sheet: ${m.sheetPrice} | ERP: ${m.erpPrice}`);
      console.log(`  Cost  -> Sheet: ${m.sheetCost} | ERP: ${m.erpCost} (Diff: ${m.costDiff})`);
    });
  }

  if (onlyInSheet.length > 0) {
    console.log("\n⚠️ ORDERS ONLY IN SHEET:");
    onlyInSheet.forEach(o => {
      console.log(` - Order ID: ${o.id} | Ref: ${o.ref} | Price: ${o.price} | Cost: ${o.cost} | ${o.titles}`);
    });
  }

  if (onlyInErp.length > 0) {
    console.log("\n📡 ORDERS ONLY IN ERP:");
    onlyInErp.forEach(o => {
      console.log(` - Order ID: ${o.shopify_order_id} | Ref: ${o.ref_number} | Price: ${o.price} | Cost: ${o.cost} | ${o.product_titles}`);
    });
  }
}

main().catch(err => {
  console.error(err);
});
