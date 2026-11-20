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
 * Partial / Exchange Item-Only Shopify Restock via Inventory Levels Adjust API
 * Restocks ONLY selected variant(s) without refunding or cancelling the original Delivered order.
 */
async function restockPartialItems(store, shopifyOrderId, items, locationId = null) {
  if (!store || !Array.isArray(items) || items.length === 0) {
    return { success: false, restockedCount: 0, failedCount: 0, details: [], summary: '⏭️ No items to restock' };
  }

  let resolvedLocationId = locationId;
  let shopifyLineItems = [];

  if (shopifyOrderId) {
    try {
      const orderRes = await shopifyFetch(store, `orders/${shopifyOrderId}.json?fields=id,line_items,fulfillments`);
      if (orderRes.ok) {
        const orderObj = (await orderRes.json()).order;
        shopifyLineItems = orderObj?.line_items || [];
        if (!resolvedLocationId && orderObj?.fulfillments?.length > 0) {
          resolvedLocationId = orderObj.fulfillments[0].location_id;
        }
      }
    } catch (e) {
      console.warn(`[shopify_finance] Order fetch during partial restock failed:`, e.message);
    }
  }

  if (!resolvedLocationId) {
    resolvedLocationId = await getPrimaryLocationId(store);
  }

  if (!resolvedLocationId) {
    throw new Error("Could not resolve Shopify Location ID (missing 'read_locations' scope and no order fulfillments).");
  }

  let restockedCount = 0;
  let failedCount = 0;
  const details = [];

  for (const item of items) {
    const qty = parseInt(item.quantity, 10) || 0;
    if (qty <= 0 || !item.restock) {
      details.push({ title: item.title, variant: item.variant_title, qty, status: '⏭️ Skipped (No Restock)' });
      continue;
    }

    let rawVarId = item.variant_id ? String(item.variant_id).trim() : '';
    let numericVarId = rawVarId.includes('/') ? rawVarId.split('/').pop() : rawVarId;

    // Fallback: locate variant_id from live Shopify order line_items if missing locally
    if (!numericVarId && shopifyLineItems.length > 0) {
      const matchedLi = shopifyLineItems.find(li =>
        (item.sku && li.sku && String(li.sku).trim().toLowerCase() === String(item.sku).trim().toLowerCase()) ||
        ((li.title || '').trim().toLowerCase() === (item.title || '').trim().toLowerCase() &&
          (!item.variant_title || (li.variant_title || '').trim().toLowerCase() === (item.variant_title || '').trim().toLowerCase()))
      );
      if (matchedLi?.variant_id) numericVarId = String(matchedLi.variant_id);
    }

    if (!numericVarId || isNaN(Number(numericVarId))) {
      failedCount++;
      details.push({ title: item.title, variant: item.variant_title, qty, status: '❌ No Variant ID' });
      continue;
    }

    try {
      await sleep(200);
      const varRes = await shopifyFetch(store, `variants/${numericVarId}.json?fields=id,inventory_item_id`);
      if (!varRes.ok) {
        failedCount++;
        details.push({ title: item.title, variant: item.variant_title, qty, status: `❌ Variant Fetch HTTP ${varRes.status}` });
        continue;
      }
      const invItemId = (await varRes.json()).variant?.inventory_item_id;
      if (!invItemId) {
        failedCount++;
        details.push({ title: item.title, variant: item.variant_title, qty, status: '❌ Missing inventory_item_id' });
        continue;
      }

      await sleep(200);
      const adjRes = await shopifyFetch(store, 'inventory_levels/adjust.json', {
        method: 'POST',
        body: JSON.stringify({
          location_id: Number(resolvedLocationId),
          inventory_item_id: Number(invItemId),
          available_adjustment: qty
        })
      });

      if (adjRes.ok) {
        restockedCount += qty;
        details.push({ title: item.title, variant: item.variant_title, qty, status: `✅ Restocked (+${qty})` });
      } else {
        const errText = await adjRes.text();
        failedCount++;
        details.push({ title: item.title, variant: item.variant_title, qty, status: `❌ Shopify HTTP ${adjRes.status}: ${errText.substring(0, 80)}` });
      }
    } catch (err) {
      failedCount++;
      details.push({ title: item.title, variant: item.variant_title, qty, status: `❌ ${err.message}` });
    }
  }

  // Append clean audit note to Shopify Order (without altering order status or refunding)
  if (shopifyOrderId && details.length > 0) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const itemSummary = items.map(it => {
        const label = it.variant_title ? `${it.title} (${it.variant_title})` : it.title;
        return `${label} x${it.quantity} [${it.qc_status === 'damaged' ? 'Damaged/No Restock' : (it.restock ? 'Restocked' : 'Logged')}]`;
      }).join(', ');
      await appendShopifyNote(store, shopifyOrderId, `| 🔄 Exchange Partial Return (${today}): ${itemSummary}`);
    } catch (noteErr) {
      console.warn(`[shopify_finance] Partial return note append failed:`, noteErr.message);
    }
  }

  const summary = restockedCount > 0
    ? `✅ Restocked ${restockedCount} unit(s)${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
    : (failedCount > 0 ? `❌ Restock Failed (${failedCount})` : '⏭️ Logged (No Restock)');

  return { success: failedCount === 0, restockedCount, failedCount, details, summary };
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
  getShopifyFinancials,
  captureShopifyPayment,
  getShopifyOrderStatus,
  getShopifyInventoryCosts,
  getShopifySingleProductCosts,
  markShopifyOrderDelivered
};

