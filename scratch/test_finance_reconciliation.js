const { db } = require('../backend/db');
const fetch = require('node-fetch');
const express = require('express');
const app = express();
app.use(express.json());

// Load routers
const financeRouter = require('../backend/routes/finance/finance-sessions');
app.use('/api/finance', financeRouter);

const PORT = 9977;

async function runTest() {
  const server = app.listen(PORT, async () => {
    console.log(`🔌 Local test finance server listening on port ${PORT}`);

    try {
      // 1. Setup mock store & orders
      console.log('Setting up mock store and test orders...');
      
      // Clean old test data
      db.prepare("DELETE FROM orders WHERE tracking_number IN ('T_DELIV_1', 'T_RET_1', 'T_RET_REC_1')").run();
      db.prepare("DELETE FROM recon_sessions WHERE store_id = 999").run();
      db.prepare("DELETE FROM cpr_settlements WHERE store_id = 999").run();
      db.prepare("DELETE FROM stores WHERE id = 999").run();

      db.prepare(`
        INSERT OR REPLACE INTO stores (id, shop_domain, store_name, access_token, postex_token)
        VALUES (999, 'mock-finance-store.myshopify.com', 'Mock Store', 'mock-token', 'mock-postex-token')
      `).run();

      // Order 1: Will be reconciled as Delivered ('D')
      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, status_date, order_date, delivery_status, payment_status, ref_number, phone, tenant_id)
        VALUES (999, 'shopify-deliv-1', 'T_DELIV_1', 'postex', '2026-06-20 10:00:00', '2026-06-20 09:00:00', 'Booked', 'Pending', 'REF-DELIV-1', '03001234567', 'default')
      `).run();

      // Order 2: Will be reconciled as Returned ('R')
      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, status_date, order_date, delivery_status, payment_status, ref_number, phone, tenant_id)
        VALUES (999, 'shopify-ret-1', 'T_RET_1', 'postex', '2026-06-20 10:00:00', '2026-06-20 09:00:00', 'Booked', 'Pending', 'REF-RET-1', '03001234567', 'default')
      `).run();

      // Order 3: Already 'Return Received', should stay 'Return Received' even if sheet says 'R'
      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, tracking_number, courier, status_date, order_date, delivery_status, payment_status, ref_number, phone, tenant_id)
        VALUES (999, 'shopify-ret-rec-1', 'T_RET_REC_1', 'postex', '2026-06-20 10:00:00', '2026-06-20 09:00:00', 'Return Received', 'Pending', 'REF-RET-REC-1', '03001234567', 'default')
      `).run();

      // --- SCENARIO A: MANUAL BULK-UPDATE TEST ---
      console.log('\n--- SCENARIO A: Testing manual bulk-update endpoint ---');
      const bulkRes = await fetch(`http://localhost:${PORT}/api/finance/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 999,
          masterKey: 'Match by Tracking Number',
          syncToShopify: false,
          rows: [
            { trackingNumber: 'T_DELIV_1', type: 'D', codAmount: 2500, charges: 250, date: '2026-06-20', ref: 'CPR-BULK-123' },
            { trackingNumber: 'T_RET_1', type: 'R', codAmount: 0, charges: 200, date: '2026-06-20', ref: 'CPR-BULK-123' },
            { trackingNumber: 'T_RET_REC_1', type: 'R', codAmount: 0, charges: 200, date: '2026-06-20', ref: 'CPR-BULK-123' }
          ]
        })
      });
      
      console.log('Bulk Update Response Status:', bulkRes.status);
      const bulkData = await bulkRes.json();
      console.log('Bulk Update Response:', JSON.stringify(bulkData.summary));

      // Assertions for Bulk Update
      const o1_bulk = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee FROM orders WHERE tracking_number = 'T_DELIV_1'").get();
      const o2_bulk = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee FROM orders WHERE tracking_number = 'T_RET_1'").get();
      const o3_bulk = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee FROM orders WHERE tracking_number = 'T_RET_REC_1'").get();

      console.log('Order 1 (Delivered):', o1_bulk);
      console.log('Order 2 (Returned):', o2_bulk);
      console.log('Order 3 (Return Received):', o3_bulk);

      if (o1_bulk.delivery_status !== 'Delivered' || o1_bulk.payment_status !== 'Paid') {
        throw new Error('Bulk Update: Order 1 was not set to Delivered/Paid');
      }
      if (o2_bulk.delivery_status !== 'Returned' || o2_bulk.payment_status !== 'Returned' || o2_bulk.paid_amount !== 0) {
        throw new Error('Bulk Update: Order 2 was not set to Returned/Returned with 0 paid amount');
      }
      if (o3_bulk.delivery_status !== 'Return Received' || o3_bulk.payment_status !== 'Returned' || o3_bulk.paid_amount !== 0) {
        throw new Error('Bulk Update: Order 3 Return Received status was not preserved');
      }
      console.log('✅ SCENARIO A PASSED SUCCESSFULLY!');

      // Reset orders back to initial states
      console.log('\nResetting database for Scenario B...');
      db.prepare("UPDATE orders SET delivery_status = 'Booked', payment_status = 'Pending', paid_amount = NULL, courier_fee = NULL, payment_ref = NULL, payment_date = NULL WHERE tracking_number = 'T_DELIV_1'").run();
      db.prepare("UPDATE orders SET delivery_status = 'Booked', payment_status = 'Pending', paid_amount = NULL, courier_fee = NULL, payment_ref = NULL, payment_date = NULL WHERE tracking_number = 'T_RET_1'").run();
      db.prepare("UPDATE orders SET delivery_status = 'Return Received', payment_status = 'Pending', paid_amount = NULL, courier_fee = NULL, payment_ref = NULL, payment_date = NULL WHERE tracking_number = 'T_RET_REC_1'").run();
      db.prepare("DELETE FROM cpr_settlements WHERE store_id = 999").run();

      // --- SCENARIO B: LIVE API / CPR LOCK TEST ---
      console.log('\n--- SCENARIO B: Testing lock-cpr endpoint ---');
      const lockRes = await fetch(`http://localhost:${PORT}/api/finance/lock-cpr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 999,
          courier: 'PostEx',
          cpr: 'CPR-TEST-999',
          settlementDate: '2026-06-20',
          totalOrders: 3,
          totalCod: 2500,
          totalExpense: 650,
          netPayout: 1850,
          actualBankDeposit: 1850,
          discrepancyAmount: 0,
          discrepancyReason: null,
          auditStatus: 'CLEARED',
          orders: [
            { 'Order ID': 'REF-DELIV-1', 'Tracking Number': 'T_DELIV_1', 'Status': 'D', 'Amount Collected': 2500, 'Total Expense': 250 },
            { 'Order ID': 'REF-RET-1', 'Tracking Number': 'T_RET_1', 'Status': 'R', 'Amount Collected': 0, 'Total Expense': 200 },
            { 'Order ID': 'REF-RET-REC-1', 'Tracking Number': 'T_RET_REC_1', 'Status': 'R', 'Amount Collected': 0, 'Total Expense': 200 }
          ]
        })
      });

      console.log('CPR Lock Response Status:', lockRes.status);
      const lockData = await lockRes.json();
      console.log('CPR Lock Response:', JSON.stringify(lockData));

      // Assertions for CPR Lock
      const o1_lock = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee, payment_ref FROM orders WHERE tracking_number = 'T_DELIV_1'").get();
      const o2_lock = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee, payment_ref FROM orders WHERE tracking_number = 'T_RET_1'").get();
      const o3_lock = db.prepare("SELECT delivery_status, payment_status, paid_amount, courier_fee, payment_ref FROM orders WHERE tracking_number = 'T_RET_REC_1'").get();

      console.log('Order 1 (Delivered):', o1_lock);
      console.log('Order 2 (Returned):', o2_lock);
      console.log('Order 3 (Return Received):', o3_lock);

      if (o1_lock.delivery_status !== 'Delivered' || o1_lock.payment_status !== 'Paid' || o1_lock.payment_ref !== 'CPR-TEST-999') {
        throw new Error('CPR Lock: Order 1 was not set to Delivered/Paid under CPR');
      }
      if (o2_lock.delivery_status !== 'Returned' || o2_lock.payment_status !== 'Returned' || o2_lock.paid_amount !== 0 || o2_lock.payment_ref !== 'CPR-TEST-999') {
        throw new Error('CPR Lock: Order 2 was not set to Returned/Returned with 0 paid amount under CPR');
      }
      if (o3_lock.delivery_status !== 'Return Received' || o3_lock.payment_status !== 'Returned' || o3_lock.paid_amount !== 0 || o3_lock.payment_ref !== 'CPR-TEST-999') {
        throw new Error('CPR Lock: Order 3 Return Received status was not preserved under CPR');
      }
      console.log('✅ SCENARIO B PASSED SUCCESSFULLY!');

      cleanupAndExit(0);
    } catch (err) {
      console.error('\n❌ FAILURE:', err.message);
      cleanupAndExit(1);
    }
  });

  function cleanupAndExit(code) {
    console.log('\nCleaning up database changes...');
    db.prepare("DELETE FROM orders WHERE tracking_number IN ('T_DELIV_1', 'T_RET_1', 'T_RET_REC_1')").run();
    db.prepare("DELETE FROM recon_sessions WHERE store_id = 999").run();
    db.prepare("DELETE FROM cpr_settlements WHERE store_id = 999").run();
    db.prepare("DELETE FROM stores WHERE id = 999").run();
    server.close(() => {
      console.log('🔌 Local server stopped. Exiting.');
      process.exit(code);
    });
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
