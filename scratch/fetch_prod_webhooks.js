const fetch = require('node-fetch');

async function check() {
  console.log("📡 Querying production diagnostics for PostEx sync timeline...");
  try {
    const res = await fetch('https://trace-erp-production.up.railway.app/api/public/poll-diag');
    if (!res.ok) {
      console.error(`HTTP Error: ${res.status}`);
      return;
    }
    const data = await res.json();

    console.log("\n🛑 --- RECENT POSTEX / PREMATURE CLOSE ERRORS IN PRODUCTION LOGS ---");
    if (data.postex_errors && data.postex_errors.length > 0) {
      console.table(data.postex_errors.slice(0, 15).map(e => ({
        time: e.created_at,
        module: e.module,
        message: e.message.substring(0, 120) + "..."
      })));
    } else {
      console.log("No PostEx errors found.");
    }

    console.log("\n🔄 --- RECENT SYNC AUDIT LOGS IN PRODUCTION ---");
    if (data.sync_audits && data.sync_audits.length > 0) {
      console.table(data.sync_audits.slice(0, 15).map(a => ({
        time: a.timestamp,
        tracking: a.tracking_number,
        message: a.message,
        level: a.level
      })));
    } else {
      console.log("No sync audit records found.");
    }

    console.log("\n📦 --- RECENTLY UPDATED POSTEX ORDERS IN PRODUCTION ---");
    if (data.postex_orders && data.postex_orders.length > 0) {
      console.table(data.postex_orders.slice(0, 10).map(o => ({
        orderId: o.shopify_order_id,
        ref: o.ref_number,
        tracking: o.tracking_number,
        deliveryStatus: o.delivery_status,
        courierStatus: o.courier_status,
        statusDate: o.status_date
      })));
    } else {
      console.log("No PostEx orders found.");
    }

  } catch (err) {
    console.error("Error fetching diagnostics:", err.message);
  }
}

check();
