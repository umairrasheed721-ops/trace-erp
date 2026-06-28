// Simulation of healCostsForStore logic for order 201919
const catalog = [
  {
    "shopify_variant_id": "gid://shopify/ProductVariant/44368693002430",
    "sku": "AR-000595",
    "parent_title": "ZR T-shirt for men",
    "variant_title": "Navy blue / large",
    "landed_cost": 450,
    "packaging_cost": 0
  },
  {
    "shopify_variant_id": "gid://shopify/ProductVariant/44283174092990",
    "sku": "AR-000579",
    "parent_title": "ZR T-shirt for men",
    "variant_title": "Red / large",
    "landed_cost": 450,
    "packaging_cost": 0
  }
];

const order = {
  "id": 201919,
  "line_items": JSON.stringify([
    {"id":17063098941630,"variant_id":44368693002430,"title":"ZR T-shirt for men","variant_title":"Navy blue / large","sku":"AR-000595","quantity":1,"price":"1190.00","image_url":"https://cdn.shopify.com/s/files/1/0660/3338/5662/files/7j.png?v=1722691954"},
    {"id":17063098974398,"variant_id":44283174092990,"title":"ZR T-shirt for men","variant_title":"Red / large","sku":"AR-000579","quantity":1,"price":"1190.00","image_url":"https://cdn.shopify.com/s/files/1/0660/3338/5662/files/6j.png?v=1722691560"}
  ]),
  "product_titles": "ZR T-shirt for men - Navy blue / large (x1), ZR T-shirt for men - Red / large (x1)"
};

console.log('--- RUNNING SIMULATION ON LINE_ITEMS ---');
let totalLanded = 0;
let totalPackaging = 0;
let matched = false;

let parsedItems = [];
try {
  if (order.line_items) parsedItems = JSON.parse(order.line_items);
} catch (e) {}

if (parsedItems.length > 0) {
  for (const item of parsedItems) {
    const qty = item.quantity || 0;
    console.log(`Processing item: "${item.title}" | "${item.variant_title}" | Qty: ${qty}`);
    if (qty === 0) continue;

    let matchRow = null;
    const vId = item.variant_id ? String(item.variant_id) : '';
    const sku = item.sku ? String(item.sku).trim() : '';
    
    if (vId || sku) {
      matchRow = catalog.find(c => 
        (vId && c.shopify_variant_id === vId) || 
        (sku && c.sku === sku)
      );
      if (matchRow) console.log('Matched by Variant ID or SKU:', matchRow.parent_title, '| variant_title:', matchRow.variant_title);
    }

    if (!matchRow && item.title) {
      const pName = item.title.trim();
      const vName = item.variant_title ? item.variant_title.trim() : '';
      
      console.log(`Trying name match: pName="${pName}", vName="${vName}"`);
      matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
      if (matchRow) console.log('Matched by direct parent + variant title');
      
      if (!matchRow) {
        matchRow = catalog.find(c => c.parent_title === pName);
        if (matchRow) console.log('Matched by parent title only');
      }
      
      if (!matchRow && vName) {
        // Match when variant properties are appended to the product title in Shopify (ghost setups)
        const fullSearchTitle1 = `${pName} - ${vName}`;
        const fullSearchTitle2 = `${pName} - ${vName.split('/').map(x => x.trim()).reverse().join(' / ')}`;
        console.log(`Trying ghost match: search1="${fullSearchTitle1}", search2="${fullSearchTitle2}"`);
        
        matchRow = catalog.find(c => 
          c.parent_title.trim() === fullSearchTitle1 || 
          c.parent_title.trim() === fullSearchTitle2
        );
        if (matchRow) console.log('Matched by ghost title combination:', matchRow.parent_title);
      }
    }

    if (matchRow) {
      totalLanded += matchRow.landed_cost * qty;
      totalPackaging += (matchRow.packaging_cost || 0) * qty;
      matched = true;
    }
  }
}

console.log('Result:', { matched, totalLanded, totalPackaging });
