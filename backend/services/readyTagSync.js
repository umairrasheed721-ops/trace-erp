/**
 * 🏷️ Ready to Book Tag — 2-Way Shopify ⇄ ERP Sync & Auto-Cleanup Service
 *
 * Rules:
 *  1. Shopify order tagged "Ready to Book" + untracked + ERP Pending  → ERP auto-moves to `Confirmed`.
 *  2. Order fulfilled / tracked / Booked / In Transit / Delivered / Returned / Cancelled while still
 *     carrying "Ready to Book" → tag auto-removed from local DB immediately and from Shopify via a
 *     throttled background queue (no matter if booking happened in Shopify or in ERP).
 *  3. Frozen store (1i7tnb-bb.myshopify.com) is NEVER written to.
 *
 * Railway safety (Rule 9): single-flight queue, hard cap on queued jobs, 550ms throttle between
 * Shopify writes, explicit timeouts, and no unbounded in-memory arrays.
 */
const { db } = require('../db');
const tenantContext = require('../tenant-context');

const READY_TAG_LOWER = 'ready to book';
const FROZEN_STORE_DOMAINS = ['1i7tnb-bb.myshopify.com'];
const ADVANCED_STATUSES = ['booked', 'in transit', 'delivered', 'returned', 'return received', 'cancelled'];
const SHOPIFY_WRITE_DELAY_MS = 550; // Throttle between Shopify tag writes (stays under 2 req/s REST bucket)
const MAX_QUEUE_SIZE = 2000;        // Hard cap to prevent unbounded RAM growth
const SHOPIFY_TIMEOUT_MS = 8000;    // Per-request Shopify API timeout
const GQL_PAGE_SIZE = 100;
const GQL_MAX_PAGES = 30;           // Max 3000 orders scanned per store per cleanup run

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lower = (v) => String(v || '').trim().toLowerCase();

function hasReadyTag(tags) {
  return String(tags || '').split(',').some(t => t.trim().toLowerCase() === READY_TAG_LOWER);
}

function stripReadyTag(tags) {
  return String(tags || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t && t.toLowerCase() !== READY_TAG_LOWER)
    .join(', ');
}

function isTracked(trackingNumber) {
  const t = String(trackingNumber || '').trim();
  return t !== '' && t !== '—';
}

function isFrozenStore(shopDomain) {
  return FROZEN_STORE_DOMAINS.includes(lower(shopDomain));
}

function needsTagRemoval(row) {
  return hasReadyTag(row.tags) && (isTracked(row.tracking_number) || ADVANCED_STATUSES.includes(lower(row.delivery_status)));
}

function needsAutoConfirm(row) {
  return hasReadyTag(row.tags) && !isTracked(row.tracking_number) && ['pending', ''].includes(lower(row.delivery_status));
}

// ─── Background Shopify Tag Removal Queue ────────────────────────────────────
const removalQueue = new Map(); // key: `${tenant}:${storeId}:${shopifyOrderId}` → job
let queueRunning = false;

function enqueueShopifyRemoval(storeId, shopifyOrderId) {
  if (!storeId || !shopifyOrderId) return false;
  const tenantId = tenantContext.getStore() || 'default';
  const key = `${tenantId}:${storeId}:${shopifyOrderId}`;
  if (removalQueue.has(key)) return true;
  if (removalQueue.size >= MAX_QUEUE_SIZE) {
    console.warn(`⚠️ [ReadyTagSync] Queue full (${MAX_QUEUE_SIZE}) — skipping ${shopifyOrderId}; next refresh will retry.`);
    return false;
  }
  removalQueue.set(key, { tenantId, storeId, shopifyOrderId: String(shopifyOrderId) });
  if (!queueRunning) setImmediate(drainQueue);
  return true;
}

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  const { READY_TO_BOOK_TAG, updateShopifyOrderTag } = require('../engines/shopify');
  try {
    while (removalQueue.size > 0) {
      const [key, job] = removalQueue.entries().next().value;
      removalQueue.delete(key);
      try {
        await tenantContext.run(job.tenantId, async () => {
          const store = db.prepare('SELECT id, shop_domain, access_token FROM stores WHERE id = ?').get(job.storeId);
          if (!store || isFrozenStore(store.shop_domain)) return;
          const res = await updateShopifyOrderTag(store, job.shopifyOrderId, READY_TO_BOOK_TAG, 'remove');
          if (res?.ok && res.changed) {
            console.log(`🏷️ [ReadyTagSync] Removed "Ready to Book" on Shopify order ${job.shopifyOrderId} (${store.shop_domain})`);
          } else if (!res?.ok && !res?.skipped) {
            console.warn(`⚠️ [ReadyTagSync] Shopify removal failed for ${job.shopifyOrderId}: ${res?.error}`);
          }
        });
      } catch (err) {
        console.warn(`⚠️ [ReadyTagSync] Job error for ${job.shopifyOrderId}:`, err.message);
      }
      await sleep(SHOPIFY_WRITE_DELAY_MS);
    }
  } finally {
    queueRunning = false;
  }
}

// ─── Local Reconciliation ───────────────────────────────────────────────────
/**
 * Reconcile a single local order row. Row must include:
 * id, store_id, shopify_order_id, tags, tracking_number, delivery_status
 */
function reconcileOrderRow(row, { pushToShopify = true } = {}) {
  if (!row || !hasReadyTag(row.tags)) return { confirmed: false, removed: false };

  if (needsTagRemoval(row)) {
    const nextTags = stripReadyTag(row.tags);
    db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(nextTags, row.id);
    if (pushToShopify) enqueueShopifyRemoval(row.store_id, row.shopify_order_id);
    return { confirmed: false, removed: true };
  }

  if (needsAutoConfirm(row)) {
    const res = db.prepare(`
      UPDATE orders SET delivery_status = 'Confirmed', status_date = datetime('now')
      WHERE id = ?
        AND (delivery_status IS NULL OR LOWER(delivery_status) IN ('pending', ''))
        AND (tracking_number IS NULL OR TRIM(tracking_number) IN ('', '—'))
    `).run(row.id);
    return { confirmed: res.changes > 0, removed: false };
  }

  return { confirmed: false, removed: false };
}

const ROW_COLUMNS = 'id, store_id, shopify_order_id, tags, tracking_number, delivery_status';

function reconcileByShopifyId(storeId, shopifyOrderId) {
  try {
    const row = db.prepare(`SELECT ${ROW_COLUMNS} FROM orders WHERE store_id = ? AND shopify_order_id = ?`)
      .get(storeId, String(shopifyOrderId));
    return reconcileOrderRow(row);
  } catch (err) {
    console.warn('[ReadyTagSync] reconcileByShopifyId error:', err.message);
    return { confirmed: false, removed: false };
  }
}

/** Call right after ANY successful ERP courier booking (PostEx / Instaworld / bulk). */
function clearReadyTagAfterBooking(orderId) {
  try {
    const row = db.prepare(`SELECT ${ROW_COLUMNS} FROM orders WHERE id = ?`).get(orderId);
    return reconcileOrderRow(row);
  } catch (err) {
    console.warn('[ReadyTagSync] clearReadyTagAfterBooking error:', err.message);
    return { confirmed: false, removed: false };
  }
}

/** Store-wide local reconcile (runs after every Shopify refresh). Only scans tagged rows. */
function reconcileStore(storeId) {
  let confirmed = 0, removed = 0;
  try {
    const rows = db.prepare(`
      SELECT ${ROW_COLUMNS} FROM orders
      WHERE store_id = ? AND tags IS NOT NULL AND LOWER(tags) LIKE '%ready to book%'
    `).all(storeId);
    for (const row of rows) {
      const r = reconcileOrderRow(row);
      if (r.confirmed) confirmed++;
      if (r.removed) removed++;
    }
    if (confirmed || removed) {
      console.log(`🏷️ [ReadyTagSync] Store ${storeId}: auto-confirmed ${confirmed}, cleaned ${removed} fulfilled/tracked orders.`);
    }
  } catch (err) {
    console.warn('[ReadyTagSync] reconcileStore error:', err.message);
  }
  return { confirmed, removed };
}

// ─── Historical Cleanup (Shopify GraphQL = Source of Truth) ─────────────────
async function shopifyGraphQL(store, query, variables) {
  const fetch = require('../engines/fetch');
  const res = await fetch(`https://${store.shop_domain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': store.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    timeout: SHOPIFY_TIMEOUT_MS,
    retries: 2
  });
  if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join(', '));
  return data.data;
}

const TAGGED_ORDERS_QUERY = `
  query TaggedOrders($q: String!, $after: String) {
    orders(first: ${GQL_PAGE_SIZE}, query: $q, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          legacyResourceId
          name
          tags
          cancelledAt
          displayFulfillmentStatus
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const TAGS_REMOVE_MUTATION = `
  mutation RemoveReadyTag($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      userErrors { field message }
    }
  }
`;

async function scanStoreTaggedOrders(store, days) {
  const since = new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);
  const q = `tag:"Ready to Book" created_at:>=${since}`;
  const toRemove = [];
  const toConfirm = [];
  let after = null;

  for (let page = 0; page < GQL_MAX_PAGES; page++) {
    const data = await shopifyGraphQL(store, TAGGED_ORDERS_QUERY, { q, after });
    const conn = data?.orders;
    for (const { node } of (conn?.edges || [])) {
      const exactTags = (node.tags || []).filter(t => t.trim().toLowerCase() === READY_TAG_LOWER);
      if (exactTags.length === 0) continue;

      const local = db.prepare(`SELECT ${ROW_COLUMNS}, ref_number FROM orders WHERE store_id = ? AND shopify_order_id = ?`)
        .get(store.id, String(node.legacyResourceId));

      const fulfillment = String(node.displayFulfillmentStatus || '').toUpperCase();
      const shopifyDone = Boolean(node.cancelledAt) || ['FULFILLED', 'PARTIALLY_FULFILLED', 'IN_PROGRESS', 'RESTOCKED'].includes(fulfillment);
      const localDone = local ? (isTracked(local.tracking_number) || ADVANCED_STATUSES.includes(lower(local.delivery_status))) : false;

      const entry = { gid: node.id, shopifyOrderId: String(node.legacyResourceId), name: node.name, exactTags, local };
      if (shopifyDone || localDone) toRemove.push(entry);
      else if (local && needsAutoConfirm({ ...local, tags: 'Ready to Book' })) toConfirm.push(entry);
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return { toRemove, toConfirm };
}

function getEligibleStores(storeIds) {
  const all = db.prepare("SELECT id, store_name, shop_domain, access_token FROM stores WHERE access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING'").all();
  const wanted = Array.isArray(storeIds) && storeIds.length ? new Set(storeIds.map(Number)) : null;
  return all.filter(s => !isFrozenStore(s.shop_domain) && (!wanted || wanted.has(Number(s.id))));
}

/** Dry-run preview: per-store counts of fulfilled-but-tagged orders & tagged-unfulfilled orders. */
async function previewHistoricalCleanup({ storeIds, days = 30 } = {}) {
  const stores = getEligibleStores(storeIds);
  const results = [];
  for (const store of stores) {
    try {
      const { toRemove, toConfirm } = await scanStoreTaggedOrders(store, days);
      results.push({
        store_id: store.id,
        store_name: store.store_name,
        shop_domain: store.shop_domain,
        to_remove: toRemove.length,
        to_confirm: toConfirm.length,
        sample_remove: toRemove.slice(0, 8).map(e => e.name),
        sample_confirm: toConfirm.slice(0, 8).map(e => e.name)
      });
    } catch (err) {
      results.push({ store_id: store.id, store_name: store.store_name, shop_domain: store.shop_domain, error: err.message, to_remove: 0, to_confirm: 0 });
    }
  }
  return { days: Number(days), stores: results, frozen_excluded: FROZEN_STORE_DOMAINS };
}

/** Live execution (runs in background). Broadcasts progress via SSE sync_progress capsule. */
async function runHistoricalCleanup({ storeIds, days = 30, actor = 'ReadyTagCleanup' } = {}) {
  const { broadcast } = require('../sse');
  const stores = getEligibleStores(storeIds);
  const summary = [];

  for (const store of stores) {
    let removed = 0, confirmed = 0, failed = 0;
    global.syncProgress = global.syncProgress || {};
    try {
      const { toRemove, toConfirm } = await scanStoreTaggedOrders(store, days);
      const total = toRemove.length + toConfirm.length;
      global.syncProgress[store.id] = { status: '🏷️ Cleaning Ready to Book tags...', actionType: 'Ready Tag Cleanup', processed: 0, total, success: 0, failed: 0 };
      broadcast('sync_progress', { storeId: store.id, ...global.syncProgress[store.id] });

      let processed = 0;
      for (const entry of toRemove) {
        try {
          const data = await shopifyGraphQL(store, TAGS_REMOVE_MUTATION, { id: entry.gid, tags: entry.exactTags });
          const errs = data?.tagsRemove?.userErrors || [];
          if (errs.length) throw new Error(errs.map(e => e.message).join(', '));
          if (entry.local) {
            db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(stripReadyTag(entry.local.tags), entry.local.id);
          }
          removed++;
        } catch (err) {
          failed++;
          console.warn(`⚠️ [ReadyTagCleanup] ${entry.name} failed:`, err.message);
        }
        processed++;
        if (processed % 5 === 0 || processed === total) {
          global.syncProgress[store.id] = { ...global.syncProgress[store.id], status: `🏷️ Cleaning tags ${processed}/${total}...`, processed, success: removed + confirmed, failed };
          broadcast('sync_progress', { storeId: store.id, ...global.syncProgress[store.id] });
        }
        await sleep(SHOPIFY_WRITE_DELAY_MS);
      }

      for (const entry of toConfirm) {
        const r = reconcileOrderRow({ ...entry.local, tags: entry.local.tags && hasReadyTag(entry.local.tags) ? entry.local.tags : 'Ready to Book' }, { pushToShopify: false });
        if (r.confirmed) {
          if (!hasReadyTag(entry.local.tags)) {
            const merged = [String(entry.local.tags || '').trim(), 'Ready to Book'].filter(Boolean).join(', ');
            db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(merged, entry.local.id);
          }
          confirmed++;
        }
        processed++;
      }

      // Final local sweep for rows Shopify search might have missed (tracked locally but still tagged locally)
      const local = reconcileStore(store.id);
      removed += local.removed;
      confirmed += local.confirmed;

      global.syncProgress[store.id] = { status: 'Ready Tag Cleanup Complete', actionType: 'Ready Tag Cleanup', processed: total, total, success: removed + confirmed, failed };
      broadcast('sync_progress', { storeId: store.id, ...global.syncProgress[store.id] });
      setTimeout(() => { if (global.syncProgress) delete global.syncProgress[store.id]; }, 5000);
    } catch (err) {
      failed++;
      console.error(`❌ [ReadyTagCleanup] Store ${store.shop_domain} failed:`, err.message);
    }
    summary.push({ store_id: store.id, shop_domain: store.shop_domain, removed, confirmed, failed });
    console.log(`✅ [ReadyTagCleanup] ${store.shop_domain} by ${actor}: removed ${removed}, confirmed ${confirmed}, failed ${failed}`);
  }
  return summary;
}

module.exports = {
  hasReadyTag,
  stripReadyTag,
  reconcileOrderRow,
  reconcileByShopifyId,
  reconcileStore,
  clearReadyTagAfterBooking,
  previewHistoricalCleanup,
  runHistoricalCleanup,
  FROZEN_STORE_DOMAINS
};
