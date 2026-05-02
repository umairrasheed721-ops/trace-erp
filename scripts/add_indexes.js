const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(DB_PATH);

function addIndexes() {
  console.log('🚀 Starting index optimization...');
  
  const indexes = [
    { name: 'idx_orders_shopify_id', table: 'orders', col: 'shopify_order_id' },
    { name: 'idx_orders_phone', table: 'orders', col: 'phone' },
    { name: 'idx_orders_ref_number', table: 'orders', col: 'ref_number' },
    { name: 'idx_orders_customer_name', table: 'orders', col: 'customer_name' },
    { name: 'idx_orders_city', table: 'orders', col: 'city' }
  ];

  for (const idx of indexes) {
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.col})`);
      console.log(`✅ Index ${idx.name} created on ${idx.table}(${idx.col})`);
    } catch (e) {
      console.error(`❌ Failed to create index ${idx.name}: ${e.message}`);
    }
  }

  console.log('🎉 Index optimization complete!');
}

addIndexes();
