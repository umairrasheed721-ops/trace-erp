const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🛠️ SHOPIFY API HELPERS FOR FINANCE & RETURNS
// ==========================================

async function shopifyFetch(store, endpoint, options = {}) {
  const url = `https://${store.shop_domain}/admin/api/2024-10/${endpoint}`;
  const res = await fetch(url, {
    ...options,
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
}

async function getPrimaryLocationId(store) {
  const res = await shopifyFetch(store, 'locations.json');
  if (!res.ok) throw new Error("Could not fetch locations.");
  const data = await res.json();
  const activeLoc = data.locations.find(l => l.active) || data.locations[0];
  if (!activeLoc) throw new Error("No active location found.");
  return activeLoc.id;
}

async function processSmartRestock(store, orderId, locationId) {
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,line_items,shipping_lines`);
  if (!res.ok) throw new Error(`Order Fetch Failed: ${res.status}`);
  const order = (await res.json()).order;
  
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
            location_id: Number(locationId)
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
      refund_line_items: refundItems
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
  // Use a timestamp to bypass any API caching
  const res = await shopifyFetch(store, `orders/${orderId}.json?fields=id,note&t=${Date.now()}`);
  if (res.ok) {
    const order = (await res.json()).order;
    const currentNote = order.note || '';
    const cleanCurrentNote = currentNote.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    const lines = fullNoteText.split('\n');
    const newLines = [];
    const seenRefsInThisBatch = new Set();

    for (let line of lines) {
      if (!line.trim()) continue;

      const refMatch = line.match(/Ref:\s*([^\s|]+)/);
      const ref = refMatch ? refMatch[1] : null;

      if (ref) {
        const cleanRef = ref.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        // Skip if already in Shopify OR already in this consolidated batch
        if (cleanCurrentNote.includes(cleanRef) || seenRefsInThisBatch.has(cleanRef)) {
          console.log(`⏭️ Duplicate Ref detected: ${ref}. Skipping line.`);
          continue;
        }
        seenRefsInThisBatch.add(cleanRef);
      }

      newLines.push(line.trim());
    }

    if (newLines.length === 0) return;

    const finalNoteToAppend = newLines.join('\n');
    const newNote = currentNote ? `${currentNote}\n${finalNoteToAppend}` : finalNoteToAppend;

    await shopifyFetch(store, `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ order: { id: orderId, note: newNote } })
    });
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

module.exports = {
  getPrimaryLocationId,
  processSmartRestock,
  appendShopifyNote,
  addShopifyTag,
  getShopifyFinancials,
  captureShopifyPayment
};
