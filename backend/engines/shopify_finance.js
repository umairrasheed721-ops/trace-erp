const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ SHOPIFY API HELPERS FOR FINANCE & RETURNS
// ==========================================

async function shopifyFetch(store, endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `https://${store.shop_domain}/admin/api/2024-10/${endpoint}`;
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    
    if (res.status === 429) {
      await sleep(2000);
      return shopifyFetch(store, endpoint, options);
    }
    
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getPrimaryLocationId(store) {
  try {
    const res = await shopifyFetch(store, 'locations.json');
    if (!res.ok) {
      console.warn(`[shopify_finance] locations.json failed with status ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const activeLoc = data.locations?.find(l => l.active) || data.locations?.[0];
    return activeLoc ? activeLoc.id : null;
  } catch (err) {
    console.warn(`[shopify_finance] locations.json error:`, err.message);
    return null;
  }
}

async function processSmartRestock(store, orderId, locationId) {
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,line_items,shipping_lines,fulfillments`);
  if (!res.ok) throw new Error(`Order Fetch Failed: ${res.status}`);
  const order = (await res.json()).order;

  // Resolve locationId from fulfillments if not provided or if location fetch failed (e.g. read_locations scope missing)
  let resolvedLocationId = locationId;
  if (!resolvedLocationId && order.fulfillments && order.fulfillments.length > 0) {
    resolvedLocationId = order.fulfillments[0].location_id;
    console.log(`[shopify_finance] Resolved location ID ${resolvedLocationId} from order fulfillments for order ${orderId}`);
  }

  if (!resolvedLocationId) {
    throw new Error("Merchant approval/permission for 'read_locations' scope is missing and order has no fulfillments to resolve location ID from.");
  }
  
  const refundItems = [];
  if (order.line_items) {
    for (const item of order.line_items) {
      if (item.fulfillment_status === 'fulfilled' && item.quantity > 0) {
        const remainingQty = item.quantity - (item.refunded_quantity || 0);
        if (remainingQty > 0) {
          refundItems.push({
            line_item_id: item.id,
            quantity: remainingQty,
            restock_type: "return",
            location_id: Number(resolvedLocationId)
          });
        }
      }
    }
  }

  if (refundItems.length === 0) return "⏭️ Already Restocked";

  const payload = {
    refund: {
      currency: "PKR",
      notify: false,
      note: `Stock returned via ERP Bulk Tool`,
      refund_line_items: refundItems,
      shipping: {
        full_refund: true
      }
    }
  };

  // Skip shipping refund logic for now unless requested
  await sleep(300);
  const refundRes = await shopifyFetch(store, `orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (refundRes.status === 201 || refundRes.status === 200) {
    await addShopifyTag(store, orderId, "returned");
    return "✅ Restocked";
  } else {
    const errorText = await refundRes.text();
    return "❌ Error: " + errorText.substring(0, 100);
  }
}

async function appendShopifyNote(store, orderId, fullNoteText) {
  const t = Date.now();
  console.log(`[ShopifyNote] Processing order ${orderId} at ${t}`);
  
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,note&t=${t}`);
  if (res.ok) {
    const order = (await res.json()).order;
    const currentNote = order.note || '';
    const cleanCurrentNote = currentNote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    const lines = fullNoteText.split('\n');
    const newLines = [];
    const seenRefsInThisBatch = new Set();

    for (let line of lines) {
      if (!line.trim()) continue;

      // Extract reference - be more flexible (look for CPR pattern or Ref: prefix)
      const refMatch = line.match(/Ref:\s*([^\s|]+)/) || line.match(/(CPR-[A-Z0-9-]+)/i);
      const ref = refMatch ? refMatch[1] : null;

      if (ref) {
        const cleanRef = ref.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        if (cleanCurrentNote.includes(cleanRef) || seenRefsInThisBatch.has(cleanRef)) {
          console.log(`[ShopifyNote] Skip duplicate ref ${ref} for order ${orderId}`);
          continue;
        }
        seenRefsInThisBatch.add(cleanRef);
      } else if (currentNote.includes(line.trim())) {
        console.log(`[ShopifyNote] Skip duplicate line "${line.trim()}" for order ${orderId}`);
        continue;
      }

      newLines.push(line.trim());
    }

    if (newLines.length === 0) {
      console.log(`[ShopifyNote] All notes in batch were duplicates for order ${orderId}`);
      return;
    }

    const finalNoteToAppend = newLines.join('\n');
    const newNote = currentNote ? `${currentNote}\n${finalNoteToAppend}` : finalNoteToAppend;

    console.log(`[ShopifyNote] Updating Shopify order ${orderId} with ${newLines.length} new lines.`);
    const putRes = await shopifyFetch(store, `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ order: { id: orderId, note: newNote } })
    });
    
    if (!putRes.ok) {
      const errText = await putRes.text();
      console.error(`[ShopifyNote] PUT failed for ${orderId}: ${errText}`);
    } else {
      try {
        const { db } = require('../db');
        db.prepare('UPDATE orders SET notes = ? WHERE shopify_order_id = ? OR id = ?').run(newNote, String(orderId), String(orderId));
      } catch (err) {
        console.error(`[ShopifyNote] Failed to sync note to local DB for order ${orderId}:`, err.message);
      }
    }
    return finalNoteToAppend; // Return what was actually added
  }
}

async function removeShopifyNoteLine(store, orderId, lineToRemove) {
  const t = Date.now();
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,note&t=${t}`);
  if (res.ok) {
    const order = (await res.json()).order;
    const currentNote = order.note || '';
    if (!currentNote) return;

    // Filter out the line. We use trim and include check for robustness
    const lines = currentNote.split('\n');
    const filteredLines = lines.filter(l => l.trim() !== lineToRemove.trim());

    if (lines.length === filteredLines.length) return; // Nothing found to remove

    const newNote = filteredLines.join('\n').trim();
    await shopifyFetch(store, `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ order: { id: orderId, note: newNote } })
    });
    console.log(`[ShopifyNote] Removed line from order ${orderId}`);
  }
}

async function addShopifyTag(store, orderId, newTag) {
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,tags`);
  if (res.ok) {
    const currentTags = (await res.json()).order.tags || '';
    if (!currentTags.includes(newTag)) {
      const tags = currentTags ? `${currentTags}, ${newTag}` : newTag;
      await shopifyFetch(store, `orders/${orderId}.json`, {
        method: 'PUT',
        body: JSON.stringify({ order: { id: orderId, tags } })
      });
    }
  }
}

async function removeShopifyTag(store, orderId, tagToRemove) {
  if (!store || !orderId || !tagToRemove) return false;
  try {
    const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,tags`);
    if (!res.ok) return false;
    const currentTags = (await res.json()).order?.tags || '';
    const targetLower = String(tagToRemove).trim().toLowerCase();
    const parts = currentTags.split(',').map(t => t.trim()).filter(Boolean);
    const filtered = parts.filter(t => t.toLowerCase() !== targetLower);
    if (filtered.length === parts.length) return true; // Already absent
    const putRes = await shopifyFetch(store, `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ order: { id: orderId, tags: filtered.join(', ') } })
    });
    return putRes.ok;
  } catch (err) {
    console.warn(`[shopify_finance] removeShopifyTag failed for ${orderId}:`, err.message);
    return false;
  }
}

/**
 * Partial / Exchange Item-Only Shopify Restock via Orders Refunds API (Option A)
 * Uses existing `write_orders` scope (no `write_inventory` needed!) to restock ONLY selected
 * line item(s) & quantity with `transactions: []` (Rs 0 cash refund) and NO full-order refund.
 */
async function restockPartialItems(store, shopifyOrderId, items, locationId = null, options = {}) {
  const refundShipping = Boolean(options.refundShipping);
  if (!store || !Array.isArray(items) || items.length === 0) {
    return { success: false, restockedCount: 0, failedCount: 0, details: [], summary: '⏭️ No items to restock' };
  }

  if (!shopifyOrderId) {
    return { success: false, restockedCount: 0, failedCount: items.length, details: [], summary: '❌ Missing Shopify Order ID' };
  }

  const orderRes = await shopifyFetch(store, `orders/${shopifyOrderId}.json?fields=id,line_items,fulfillments,refunds`);
  if (!orderRes.ok) {
    const errText = await orderRes.text();
    throw new Error(`Shopify Order Fetch HTTP ${orderRes.status}: ${errText.substring(0, 100)}`);
  }

  const orderObj = (await orderRes.json()).order;
  const shopifyLineItems = orderObj?.line_items || [];
  const activeFulfillment = (orderObj?.fulfillments || []).find(f => f.status !== 'cancelled') || orderObj?.fulfillments?.[0];

  let resolvedLocationId = locationId || activeFulfillment?.location_id || null;
  if (!resolvedLocationId) {
    resolvedLocationId = await getPrimaryLocationId(store);
  }
  if (!resolvedLocationId) {
    throw new Error("Could not resolve Shopify Location ID (missing 'read_locations' scope and no order fulfillments).");
  }

  // Compute exact already-refunded/restocked qty per line_item_id from order.refunds
  const refundedByLineItemId = {};
  for (const r of (orderObj?.refunds || [])) {
    for (const rli of (r.refund_line_items || [])) {
      const lid = String(rli.line_item_id);
      refundedByLineItemId[lid] = (refundedByLineItemId[lid] || 0) + (parseInt(rli.quantity, 10) || 0);
    }
  }

  const refundLineItems = [];
  const details = [];
  const usedLineItemIds = new Set();
  let failedCount = 0;
  let alreadyRestockedCount = 0;

  for (const item of items) {
    const requestedQty = parseInt(item.quantity, 10) || 0;
    if (requestedQty <= 0 || !item.restock || item.qc_status === 'damaged') {
      details.push({ title: item.title, variant: item.variant_title, qty: requestedQty, status: item.qc_status === 'damaged' ? '⚠️ Damaged (No Restock)' : '⏭️ Logged (No Restock)' });
      continue;
    }

    const rawVarId = item.variant_id ? String(item.variant_id).trim() : '';
    const numericVarId = rawVarId.includes('/') ? rawVarId.split('/').pop() : rawVarId;
    const skuLower = item.sku ? String(item.sku).trim().toLowerCase() : '';
    const titleLower = (item.title || '').trim().toLowerCase();
    const varTitleLower = (item.variant_title || '').trim().toLowerCase();

    // Match exact Shopify line item (1. variant_id -> 2. sku -> 3. title + variant_title)
    let matchedLi = shopifyLineItems.find(li =>
      !usedLineItemIds.has(String(li.id)) &&
      numericVarId && li.variant_id && String(li.variant_id) === numericVarId
    );
    if (!matchedLi && skuLower) {
      matchedLi = shopifyLineItems.find(li =>
        !usedLineItemIds.has(String(li.id)) &&
        li.sku && String(li.sku).trim().toLowerCase() === skuLower
      );
    }
    if (!matchedLi && titleLower) {
      matchedLi = shopifyLineItems.find(li =>
        !usedLineItemIds.has(String(li.id)) &&
        (li.title || '').trim().toLowerCase() === titleLower &&
        (!varTitleLower || (li.variant_title || '').trim().toLowerCase() === varTitleLower)
      );
    }

    if (!matchedLi) {
      failedCount++;
      details.push({ title: item.title, variant: item.variant_title, qty: requestedQty, status: '❌ Line item not found on Shopify order' });
      continue;
    }

    const lidStr = String(matchedLi.id);
    const alreadyRef = refundedByLineItemId[lidStr] || (matchedLi.refunded_quantity || 0);
    const remaining = Math.max(0, (matchedLi.quantity || 0) - alreadyRef);

    if (remaining <= 0) {
      alreadyRestockedCount += requestedQty;
      details.push({ title: item.title, variant: item.variant_title, qty: requestedQty, status: '⏭️ Already Restocked in Shopify' });
      continue;
    }

    const qtyToRestock = Math.min(requestedQty, remaining);
    const isFulfilled = matchedLi.fulfillment_status === 'fulfilled' ||
      matchedLi.fulfillment_status === 'partial' ||
      ((matchedLi.quantity || 0) - (matchedLi.fulfillable_quantity ?? matchedLi.quantity ?? 0)) > 0;

    usedLineItemIds.add(lidStr);
    refundLineItems.push({
      line_item_id: matchedLi.id,
      quantity: qtyToRestock,
      restock_type: isFulfilled ? 'return' : 'cancel',
      location_id: Number(resolvedLocationId)
    });
    details.push({
      title: item.title,
      variant: item.variant_title,
      qty: qtyToRestock,
      line_item_id: matchedLi.id,
      status: 'PENDING'
    });
  }

  let restockedCount = 0;
  let shopifyErrorMsg = '';

  if (refundLineItems.length > 0) {
    await sleep(250);
    const refundBody = {
      currency: 'PKR',
      notify: false,
      note: refundShipping
        ? 'Partial Exchange Restock (Shipping Refunded / Zeroed) via TRACE ERP'
        : 'Partial Exchange Restock (Delivery Charges Kept) via TRACE ERP',
      refund_line_items: refundLineItems,
      transactions: []
    };
    if (refundShipping) {
      refundBody.shipping = { full_refund: true };
    }
    const payload = { refund: refundBody };

    const refundRes = await shopifyFetch(store, `orders/${shopifyOrderId}/refunds.json`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (refundRes.status === 201 || refundRes.status === 200) {
      for (const rli of refundLineItems) {
        restockedCount += rli.quantity;
      }
      for (const d of details) {
        if (d.status === 'PENDING') d.status = `✅ Restocked (+${d.qty})`;
      }
    } else {
      const errText = await refundRes.text();
      shopifyErrorMsg = `Shopify HTTP ${refundRes.status}: ${errText.substring(0, 140)}`;
      failedCount += refundLineItems.length;
      for (const d of details) {
        if (d.status === 'PENDING') d.status = `❌ ${shopifyErrorMsg}`;
      }
    }
  }

  // Strictly honest audit note: ONLY write [Restocked] for items that actually succeeded in Shopify!
  const noteParts = details
    .filter(d => !d.status.startsWith('❌'))
    .map(d => {
      const label = d.variant ? `${d.title} (${d.variant})` : d.title;
      const tag = d.status.includes('✅ Restocked')
        ? 'Restocked'
        : d.status.includes('Already Restocked')
          ? 'Already Restocked'
          : d.status.includes('Damaged')
            ? 'Damaged/No Restock'
            : 'Logged';
      return `${label} x${d.qty} [${tag}]`;
    });

  if (shopifyOrderId && noteParts.length > 0 && failedCount === 0) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const shipLabel = refundShipping ? ' | Shipping: Zeroed' : ' | Shipping: Kept';
      await appendShopifyNote(store, shopifyOrderId, `| 🔄 Exchange Partial Return (${today}): ${noteParts.join(', ')}${shipLabel}`);
    } catch (noteErr) {
      console.warn(`[shopify_finance] Partial return note append failed:`, noteErr.message);
    }
  }

  const summary = restockedCount > 0
    ? `✅ Restocked ${restockedCount} unit(s)${refundShipping ? ' + Shipping Zeroed' : ' (Delivery Kept)'}${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
    : alreadyRestockedCount > 0 && failedCount === 0
      ? `⏭️ Already Restocked in Shopify`
      : failedCount > 0
        ? `❌ Restock Failed${shopifyErrorMsg ? `: ${shopifyErrorMsg}` : ''}`
        : '⏭️ Logged (No Restock)';

  return { success: failedCount === 0, restockedCount, alreadyRestockedCount, failedCount, details, summary };
}

/**
 * Zero out remaining shipping/delivery charges on an order whose items were already restocked
 * Uses existing `write_orders` scope via Shopify Orders Refunds API (`shipping: { full_refund: true }`).
 */
async function refundShippingOnly(store, shopifyOrderId) {
  if (!store || !shopifyOrderId) {
    return { success: false, summary: '❌ Missing store or Shopify Order ID' };
  }
  const payload = {
    refund: {
      currency: 'PKR',
      notify: false,
      note: 'Delivery Charges Zeroed via TRACE ERP',
      shipping: { full_refund: true },
      transactions: []
    }
  };
  const res = await shopifyFetch(store, `orders/${shopifyOrderId}/refunds.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (res.status === 201 || res.status === 200) {
    try {
      const today = new Date().toISOString().split('T')[0];
      await appendShopifyNote(store, shopifyOrderId, `| 💸 Delivery Charges Zeroed (${today})`);
    } catch (_) {}
    return { success: true, summary: '✅ Delivery charges zeroed in Shopify' };
  }
  const errText = await res.text();
  return { success: false, summary: `❌ Shopify HTTP ${res.status}: ${errText.substring(0, 140)}` };
}

async function getShopifyFinancials(store, orderId) {
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,total_price,total_received`);
  if (!res.ok) throw new Error("Could not fetch financials");
  const data = await res.json();
  return {
    total_price: parseFloat(data.order.total_price || 0),
    total_received: parseFloat(data.order.total_received || 0)
  };
}

async function captureShopifyPayment(store, orderId, amount) {
  const payload = {
    transaction: {
      kind: "capture",
      amount: String(amount),
      currency: "PKR"
    }
  };
  const res = await shopifyFetch(store, `orders/${orderId}/transactions.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Capture failed for ${orderId}: ${err}`);
  }
}

async function getShopifyOrderStatus(store, orderId) {
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,fulfillment_status,financial_status,cancelled_at`);
  if (!res.ok) throw new Error(`Shopify Fetch Failed: ${res.status}`);
  const order = (await res.json()).order;
  return {
    fulfillment_status: order.fulfillment_status, // null, 'partial', 'fulfilled'
    financial_status: order.financial_status, // 'pending', 'paid', 'refunded', 'partially_refunded'
    is_cancelled: Boolean(order.cancelled_at)
  };
}

async function getShopifyInventoryCosts(store, onBatch) {
  let hasNextPage = true;
  let cursor = null;
  let accumulator = [];

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        productVariants(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              sku
              price
              inventoryPolicy
              image {
                url
              }
              product {
                title
                status
              }
              inventoryItem {
                unitCost {
                  amount
                }
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      quantities(names: ["available"]) {
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await shopifyFetch(store, 'graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { cursor } })
    });
    
    if (!res.ok) throw new Error(`GraphQL Sync Failed: ${res.status}`);
    
    const json = await res.json();
    if (json.errors) throw new Error(`Shopify GraphQL Error: ${JSON.stringify(json.errors)}`);

    const pageInfo = json.data?.productVariants?.pageInfo;
    const edges = json.data?.productVariants?.edges || [];
    
    hasNextPage = pageInfo?.hasNextPage;
    cursor = pageInfo?.endCursor;

    const pageMap = {};
    edges.forEach((edge) => {
      const node = edge.node;
      if (!node) return;
      const parentName = node.product?.title;
      const variantName = node.title === 'Default Title' ? '' : node.title;
      const variantId = node.id;
      if (!parentName) return;

      const rawCost = node.inventoryItem?.unitCost?.amount;
      const cost = rawCost ? parseFloat(rawCost) : 0;
      const sellingPrice = parseFloat(node.price || 0);
      const status = node.product?.status ? String(node.product.status).toLowerCase() : 'active';

      let qty = 0;
      const invEdges = node.inventoryItem?.inventoryLevels?.edges || [];
      invEdges.forEach(invEdge => {
        qty += invEdge.node?.quantities?.[0]?.quantity || 0;
      });
      
      const key = variantId || `${parentName}@@@${variantName}`;
      if (!pageMap[key]) {
        pageMap[key] = { 
          shopify_variant_id: variantId,
          sku: node.sku || '',
          parent_name: parentName, 
          variant_name: variantName, 
          shopify_cost: cost, 
          selling_price: sellingPrice,
          qty: qty,
          image_url: node.image?.url || '',
          status: status,
          inventory_policy: node.inventoryPolicy ? String(node.inventoryPolicy).toLowerCase() : 'deny'
        };
      } else {
        pageMap[key].qty += qty;
        if (!pageMap[key].image_url && node.image?.url) {
          pageMap[key].image_url = node.image.url;
        }
      }
    });

    const pageData = Object.values(pageMap);
    if (onBatch) {
      await onBatch(pageData);
    } else {
      accumulator = accumulator.concat(pageData);
    }

    if (hasNextPage) await sleep(200); // Respect rate limits
  }

  return onBatch ? null : accumulator;
}

/**
 * getShopifySingleProductCosts — Targeted single-product GraphQL fetch
 * Fast micro-sync for webhook updates (Rule 9 optimized)
 */
async function getShopifySingleProductCosts(store, productId) {
  if (!store || !productId) return [];
  try {
    const rawId = String(productId).trim();
    const numericId = rawId.includes('/') ? rawId.split('/').pop() : rawId;
    const gid = `gid://shopify/Product/${numericId}`;

    const query = `
      query($id: ID!) {
        product(id: $id) {
          id
          title
          status
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryPolicy
                image {
                  url
                }
                product {
                  title
                  status
                }
                inventoryItem {
                  unitCost {
                    amount
                  }
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await shopifyFetch(store, 'graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { id: gid } })
    });

    if (!res.ok) {
      console.warn(`[shopify_finance] Single product GraphQL fetch failed (${res.status}) for ${gid}`);
      return [];
    }

    const json = await res.json();
    if (json.errors) {
      console.warn(`[shopify_finance] Single product GraphQL errors:`, json.errors);
      return [];
    }

    const prod = json.data?.product;
    if (!prod) return [];

    const parentName = prod.title || '';
    const edges = prod.variants?.edges || [];
    const results = [];

    for (const edge of edges) {
      const node = edge.node;
      if (!node) continue;
      const variantId = node.id;
      const variantName = node.title === 'Default Title' ? '' : (node.title || '');
      const rawCost = node.inventoryItem?.unitCost?.amount;
      const cost = rawCost ? parseFloat(rawCost) : 0;
      const sellingPrice = parseFloat(node.price || 0);
      const status = prod.status ? String(prod.status).toLowerCase() : 'active';

      let qty = 0;
      const invEdges = node.inventoryItem?.inventoryLevels?.edges || [];
      invEdges.forEach(invEdge => {
        qty += invEdge.node?.quantities?.[0]?.quantity || 0;
      });

      results.push({
        shopify_variant_id: variantId,
        sku: node.sku ? String(node.sku).trim() : '',
        parent_name: parentName,
        variant_name: variantName,
        shopify_cost: cost,
        selling_price: sellingPrice,
        qty: qty,
        image_url: node.image?.url || '',
        status: status,
        inventory_policy: node.inventoryPolicy ? String(node.inventoryPolicy).toLowerCase() : 'deny'
      });
    }

    return results;
  } catch (err) {
    console.error(`[shopify_finance] getShopifySingleProductCosts error for ${productId}:`, err.message);
    return [];
  }
}

async function markShopifyOrderDelivered(store, orderIdOrRef) {
  if (!orderIdOrRef) return false;
  try {
    let targetShopifyId = orderIdOrRef;

    // 1. Resolve numeric shopify_order_id if ref_number or string (e.g. TR33698) is passed
    if (typeof targetShopifyId === 'string' && (targetShopifyId.startsWith('TR') || targetShopifyId.startsWith('#') || isNaN(Number(targetShopifyId)))) {
      const cleanRef = targetShopifyId.replace(/^#/, '');
      try {
        const searchResp = await shopifyFetch(store, `orders.json?name=${encodeURIComponent('#' + cleanRef)}&fields=id`);
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData.orders && searchData.orders.length > 0) {
            targetShopifyId = searchData.orders[0].id;
            console.log(`[shopify_finance] Resolved ref '${cleanRef}' -> Shopify Order ID ${targetShopifyId}`);
            // Backfill local db
            try {
              const { db } = require('../db');
              db.prepare('UPDATE orders SET shopify_order_id = ? WHERE ref_number = ? OR ref_number = ?').run(String(targetShopifyId), cleanRef, '#' + cleanRef);
            } catch (_) {}
          }
        }
      } catch (sErr) {
        console.warn(`[shopify_finance] Search order by ref failed for ${targetShopifyId}:`, sErr.message);
      }
    }

    if (!targetShopifyId || isNaN(Number(targetShopifyId))) {
      console.warn(`[shopify_finance] Could not resolve valid numeric Shopify Order ID for '${orderIdOrRef}'`);
      return false;
    }

    const orderId = targetShopifyId;
    const res = await shopifyFetch(store, `orders/${orderId}/fulfillments.json`);
    if (!res.ok) {
      console.warn(`[shopify_finance] Could not fetch fulfillments for order ${orderId}: ${res.status}`);
      return false;
    }
    const data = await res.json();
    const fulfillments = data.fulfillments || [];
    const activeFulfillments = fulfillments.filter(f => f.status !== 'cancelled');

    let fulfillmentIdToMark = null;

    if (activeFulfillments.length > 0) {
      fulfillmentIdToMark = activeFulfillments[activeFulfillments.length - 1].id;
    } else {
      try {
        const foRes = await shopifyFetch(store, `orders/${orderId}/fulfillment_orders.json`);
        if (foRes.ok) {
          const foData = await foRes.json();
          const openFO = (foData.fulfillment_orders || []).find(fo => fo.status === 'open') || foData.fulfillment_orders?.[0];
          if (openFO && openFO.line_items && openFO.line_items.length > 0) {
            const payload = {
              fulfillment: {
                line_items_by_fulfillment_order: [
                  {
                    fulfillment_order_id: openFO.id,
                    fulfillment_order_line_items: openFO.line_items.map(li => ({ id: li.id, quantity: li.quantity }))
                  }
                ],
                notify_customer: false
              }
            };
            const createRes = await shopifyFetch(store, 'fulfillments.json', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            if (createRes.ok) {
              const newFData = await createRes.json();
              fulfillmentIdToMark = newFData.fulfillment?.id;
              console.log(`[shopify_finance] Created new fulfillment ${fulfillmentIdToMark} for order ${orderId}`);
            }
          }
        }
      } catch (foErr) {
        console.warn(`[shopify_finance] Auto-fulfillment creation notice for order ${orderId}:`, foErr.message);
      }
    }

    if (!fulfillmentIdToMark) {
      console.warn(`[shopify_finance] No fulfillment available to mark delivered for order ${orderId}`);
      return false;
    }

    // 2. Try REST API Fulfillment Event (delivered)
    const eventRes = await shopifyFetch(store, `fulfillments/${fulfillmentIdToMark}/events.json`, {
      method: 'POST',
      body: JSON.stringify({
        event: {
          status: 'delivered'
        }
      })
    });

    if (eventRes.ok) {
      console.log(`✅ [shopify_finance] Successfully marked order ${orderId} as Delivered via REST API! (Fulfillment: ${fulfillmentIdToMark})`);
      return true;
    }

    // 3. Fallback: Try GraphQL fulfillmentEventCreate
    try {
      const gqlQuery = `
        mutation fulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
          fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
            fulfillmentEvent {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const gqlVariables = {
        fulfillmentEvent: {
          fulfillmentId: `gid://shopify/Fulfillment/${fulfillmentIdToMark}`,
          status: "DELIVERED"
        }
      };
      const gqlRes = await shopifyFetch(store, 'graphql.json', {
        method: 'POST',
        body: JSON.stringify({ query: gqlQuery, variables: gqlVariables })
      });
      if (gqlRes.ok) {
        const gqlData = await gqlRes.json();
        const errors = gqlData.data?.fulfillmentEventCreate?.userErrors;
        if (!errors || errors.length === 0) {
          console.log(`✅ [shopify_finance] Successfully marked order ${orderId} as Delivered via GraphQL API! (Fulfillment: ${fulfillmentIdToMark})`);
          return true;
        } else {
          console.warn(`⚠️ [shopify_finance] GraphQL fulfillmentEventCreate userErrors:`, JSON.stringify(errors));
        }
      }
    } catch (gErr) {
      console.warn(`[shopify_finance] GraphQL fallback notice:`, gErr.message);
    }

    return false;
  } catch (err) {
    console.error(`❌ [shopify_finance] markShopifyOrderDelivered error for order '${orderIdOrRef}':`, err.message);
    return false;
  }
}

module.exports = {
  getPrimaryLocationId,
  processSmartRestock,
  appendShopifyNote,
  removeShopifyNoteLine,
  addShopifyTag,
  removeShopifyTag,
  restockPartialItems,
  refundShippingOnly,
  getShopifyFinancials,
  captureShopifyPayment,
  getShopifyOrderStatus,
  getShopifyInventoryCosts,
  getShopifySingleProductCosts,
  markShopifyOrderDelivered
};

