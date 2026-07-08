const db = require('../backend/db');

console.log("Checking product_master_costs for variants:");
const row1 = db.prepare(`
  SELECT * FROM product_master_costs 
  WHERE shopify_variant_id = '44765194158339' OR sku = 'AR-000171'
`).all();
console.log("Variant 1:", JSON.stringify(row1, null, 2));

const row2 = db.prepare(`
  SELECT * FROM product_master_costs 
  WHERE shopify_variant_id = '47844924817667' OR sku = 'AR-001186'
`).all();
console.log("Variant 2:", JSON.stringify(row2, null, 2));
