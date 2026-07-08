// Simulation of improved healCostsForStore logic with duplicate SKUs
const catalog = [
  {
    "shopify_variant_id": "gid://shopify/ProductVariant/46216401191171",
    "sku": "AR-001186",
    "parent_title": "Imported Nik- mesh",
    "variant_title": "L / Charcoal Grey",
    "landed_cost": 0,
    "shopify_cost": 0,
    "status": "draft"
  },
  {
    "shopify_variant_id": "gid://shopify/ProductVariant/47844924817667",
    "sku": "AR-001186",
    "parent_title": "F-PERRY Embroidery LOGO",
    "variant_title": "XL / Pista",
    "landed_cost": 550,
    "shopify_cost": 550,
    "status": "active"
  }
];

const orderItem = {
  "variant_id": 47844924817667,
  "sku": "AR-001186",
  "title": "F-PERRY Embroidery LOGO",
  "variant_title": "XL / Pista",
  "quantity": 1
};

// Logic we put in finance-corrections.js:
function findMatch(item) {
  let matchRow = null;
  const vId = item.variant_id ? String(item.variant_id) : '';
  const numericVariantId = vId.includes('/') ? vId.split('/').pop() : vId;
  const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
  const sku = item.sku ? String(item.sku).trim() : '';
  const pName = item.title ? String(item.title).trim() : '';
  const vName = item.variant_title ? String(item.variant_title).trim() : '';

  // 1. Variant ID match (prioritized)
  if (numericVariantId) {
    matchRow = catalog.find(c => 
      c.shopify_variant_id && 
      (String(c.shopify_variant_id).includes(numericVariantId) || String(c.shopify_variant_id) === gidVariantId)
    );
    if (matchRow) return { matchRow, method: 'variant_id' };
  }

  // 2. SKU match
  if (!matchRow && sku) {
    const skuMatches = catalog.filter(c => c.sku && String(c.sku).trim().toLowerCase() === sku.toLowerCase());
    if (skuMatches.length > 0) {
      skuMatches.sort((a, b) => {
        const aCost = a.landed_cost || a.shopify_cost || 0;
        const bCost = b.landed_cost || b.shopify_cost || 0;
        return (bCost > 0 ? 1 : 0) - (aCost > 0 ? 1 : 0);
      });
      matchRow = skuMatches[0];
      if (matchRow) return { matchRow, method: 'sku' };
    }
  }

  // 3. Name/Ghost match
  if (!matchRow && pName) {
    matchRow = catalog.find(c => 
      c.parent_title && c.parent_title.toLowerCase().trim() === pName.toLowerCase().trim() &&
      c.variant_title && c.variant_title.toLowerCase().trim() === vName.toLowerCase().trim()
    );
    if (matchRow) return { matchRow, method: 'ghost_exact' };
    
    if (!matchRow) {
      matchRow = catalog.find(c => c.parent_title && c.parent_title.toLowerCase().trim() === pName.toLowerCase().trim());
      if (matchRow) return { matchRow, method: 'parent_title_only' };
    }
  }

  return { matchRow: null, method: 'none' };
}

console.log("Simulating match for order item:");
console.log(orderItem);
const result = findMatch(orderItem);
console.log("\nMatch result:", JSON.stringify(result, null, 2));

// Test with SKU matching only (e.g. if variant ID is not provided or mismatching)
const itemNoVariantId = {
  "sku": "AR-001186",
  "title": "F-PERRY Embroidery LOGO",
  "variant_title": "XL / Pista",
  "quantity": 1
};
console.log("\nSimulating match for item without variant_id:");
const resultNoVariant = findMatch(itemNoVariantId);
console.log("Match result (no variant id):", JSON.stringify(resultNoVariant, null, 2));
