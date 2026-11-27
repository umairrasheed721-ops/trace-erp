const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('../engines/fetch');
const { REQUIRED_SCOPES, TRACEPK_SCOPES } = require('./auth');

const SHOPIFY_API_VERSION = '2024-10';
const DIAGNOSTIC_TIMEOUT = 5000;
const EXPECTED_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/fulfilled',
  'orders/paid',
  'orders/cancelled',
  'fulfillments/create',
  'fulfillments/update',
  'products/create',
  'products/update',
  'products/delete',
];

const STORE_SELECT_COLS = `
  id, shop_domain, store_name, last_synced_at, last_cost_sync_at, created_at,
  shopify_client_id,
  CASE WHEN shopify_client_secret IS NOT NULL AND shopify_client_secret != '' THEN 1 ELSE 0 END as has_client_secret,
  postex_token, instaworld_key, instaworld_key_backup, instaworld_key_3,
  leopards_token, tcs_token, google_maps_key, sync_start_date,
  sync_status, sync_progress, sync_total, sync_processed,
  postex_track_url, instaworld_track_url, gas_proxy_url,
  meta_ad_account_id,
  CASE WHEN meta_access_token IS NOT NULL AND meta_access_token != '' THEN 1 ELSE 0 END as has_meta_token,
  wa_phone_number_id, wa_webhook_verify_token,
  CASE WHEN wa_access_token IS NOT NULL AND wa_access_token != '' THEN 1 ELSE 0 END as has_wa_token,
  CASE WHEN access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING' THEN 1 ELSE 0 END as is_connected
`;

function cleanShopDomain(raw) {
  return String(raw || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
}

// GET /api/stores - List all stores (connected + pending) with lightweight order counts
router.get('/', (req, res) => {
  let query = `SELECT ${STORE_SELECT_COLS} FROM stores`;
  let params = [];

  if (req.user && req.user.role !== 'admin' && Array.isArray(req.user.allowed_stores)) {
    if (req.user.allowed_stores.length > 0) {
      const placeholders = req.user.allowed_stores.map(() => '?').join(',');
      query += ` WHERE id IN (${placeholders})`;
      params = req.user.allowed_stores;
    } else {
      query += ` WHERE 1 = 0`;
    }
  }

  query += ` ORDER BY created_at DESC`;

  const stores = db.prepare(query).all(...params);
  let countMap = {};
  try {
    const rows = db.prepare('SELECT store_id, COUNT(*) as cnt FROM orders GROUP BY store_id').all();
    for (const r of rows) countMap[r.store_id] = r.cnt;
  } catch (_) {}

  res.json(stores.map(s => ({ ...s, orders_count: countMap[s.id] || 0 })));
});

// POST /api/stores/direct-connect - Connect store directly using Shopify Custom App Admin Token (shpat_...)
router.post('/direct-connect', async (req, res) => {
  try {
    const {
      shop_domain, access_token, store_name, sync_start_date,
      postex_token, instaworld_key, instaworld_key_backup, instaworld_key_3,
      leopards_token, tcs_token, google_maps_key, gas_proxy_url
    } = req.body;

    const cleanDomain = cleanShopDomain(shop_domain);
    const token = String(access_token || '').trim();
    if (!cleanDomain || !token) {
      return res.status(400).json({ success: false, error: 'Shop Domain and Admin Access Token (shpat_...) are required.' });
    }

    // Verify token live against Shopify before persisting
    const verifyRes = await fetch(`https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token },
      timeout: DIAGNOSTIC_TIMEOUT,
    });
    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => '');
      return res.status(400).json({
        success: false,
        error: `Shopify rejected this token (HTTP ${verifyRes.status}). Check domain & shpat_ token. ${errText.slice(0, 120)}`
      });
    }
    const shopData = await verifyRes.json().catch(() => ({}));
    const resolvedName = (store_name || '').trim() || shopData?.shop?.name || cleanDomain;

    const existing = db.prepare('SELECT id FROM stores WHERE shop_domain = ?').get(cleanDomain);
    let storeId;
    if (!existing) {
      const result = db.prepare(`
        INSERT INTO stores (
          shop_domain, store_name, access_token,
          postex_token, instaworld_key, instaworld_key_backup, instaworld_key_3,
          leopards_token, tcs_token, google_maps_key, gas_proxy_url, sync_start_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cleanDomain, resolvedName, token,
        postex_token || '', instaworld_key || '', instaworld_key_backup || '', instaworld_key_3 || '',
        leopards_token || '', tcs_token || '', google_maps_key || '', gas_proxy_url || '', sync_start_date || ''
      );
      storeId = result.lastInsertRowid;
    } else {
      storeId = existing.id;
      db.prepare(`
        UPDATE stores SET
          access_token = ?,
          store_name = COALESCE(NULLIF(?, ''), store_name),
          postex_token = COALESCE(NULLIF(?, ''), postex_token),
          instaworld_key = COALESCE(NULLIF(?, ''), instaworld_key),
          instaworld_key_backup = COALESCE(NULLIF(?, ''), instaworld_key_backup),
          instaworld_key_3 = COALESCE(NULLIF(?, ''), instaworld_key_3),
          leopards_token = COALESCE(NULLIF(?, ''), leopards_token),
          tcs_token = COALESCE(NULLIF(?, ''), tcs_token),
          google_maps_key = COALESCE(NULLIF(?, ''), google_maps_key),
          gas_proxy_url = COALESCE(NULLIF(?, ''), gas_proxy_url),
          sync_start_date = COALESCE(NULLIF(?, ''), sync_start_date)
        WHERE id = ?
      `).run(
        token, resolvedName,
        postex_token || '', instaworld_key || '', instaworld_key_backup || '', instaworld_key_3 || '',
        leopards_token || '', tcs_token || '', google_maps_key || '', gas_proxy_url || '', sync_start_date || '',
        storeId
      );
    }

    res.json({
      success: true,
      store_id: storeId,
      shop_name: shopData?.shop?.name || resolvedName,
      primary_domain: shopData?.shop?.domain || cleanDomain,
      message: `Connected ${resolvedName} via Direct Admin API Token!`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || 'Direct connect failed' });
  }
});

// GET /api/stores/:id - Get single store info
router.get('/:id', (req, res) => {
  const store = db.prepare(`SELECT ${STORE_SELECT_COLS} FROM stores WHERE id = ?`).get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

// PUT /api/stores/:id - Update courier credentials, tracking URLs, WA config & sync settings
router.put('/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Store not found' });

  const b = req.body || {};
  const pick = (key, fallback) => (b[key] !== undefined ? (b[key] === '' ? null : b[key]) : fallback);

  // For write-only secrets (wa_access_token), keep existing unless a non-empty value or explicit clear flag is passed
  const nextWaToken = b.clear_wa_token
    ? null
    : (b.wa_access_token && String(b.wa_access_token).trim() !== '' ? String(b.wa_access_token).trim() : current.wa_access_token);

  db.prepare(`
    UPDATE stores SET
      store_name = ?,
      sync_start_date = ?,
      postex_token = ?,
      instaworld_key = ?,
      instaworld_key_backup = ?,
      instaworld_key_3 = ?,
      leopards_token = ?,
      tcs_token = ?,
      google_maps_key = ?,
      postex_track_url = ?,
      instaworld_track_url = ?,
      gas_proxy_url = ?,
      wa_phone_number_id = ?,
      wa_webhook_verify_token = ?,
      wa_access_token = ?
    WHERE id = ?
  `).run(
    pick('store_name', current.store_name),
    b.sync_start_date !== undefined ? (b.sync_start_date || '') : (current.sync_start_date || ''),
    pick('postex_token', current.postex_token),
    pick('instaworld_key', current.instaworld_key),
    pick('instaworld_key_backup', current.instaworld_key_backup),
    pick('instaworld_key_3', current.instaworld_key_3),
    pick('leopards_token', current.leopards_token),
    pick('tcs_token', current.tcs_token),
    pick('google_maps_key', current.google_maps_key),
    pick('postex_track_url', current.postex_track_url),
    pick('instaworld_track_url', current.instaworld_track_url),
    pick('gas_proxy_url', current.gas_proxy_url),
    pick('wa_phone_number_id', current.wa_phone_number_id),
    pick('wa_webhook_verify_token', current.wa_webhook_verify_token),
    nextWaToken,
    req.params.id
  );
  res.json({ success: true });
});

// GET /api/stores/:id/health - Live Shopify token, scopes, webhooks & theme audit (5s timeouts)
router.get('/:id/health', async (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ success: false, error: 'Store not found' });

  const isPending = !store.access_token || store.access_token === 'PENDING';
  if (isPending) {
    return res.json({
      success: true,
      shopify: { connected: false, error: 'OAuth authorization not completed (PENDING)' },
      scopes: { granted: [], missing: REQUIRED_SCOPES, total_required: REQUIRED_SCOPES.length },
      webhooks: { items: [], active_expected: 0, total_expected: EXPECTED_WEBHOOK_TOPICS.length, missing_topics: EXPECTED_WEBHOOK_TOPICS, has_inventory_conflict: false },
      theme: { main_theme_name: null, main_theme_id: null, scope_missing: false },
      couriers: {
        postex: !!store.postex_token,
        instaworld: !!(store.instaworld_key || store.instaworld_key_backup || store.instaworld_key_3),
        leopards: !!store.leopards_token,
        tcs: !!store.tcs_token,
        google_maps: !!store.google_maps_key,
        meta_ads: !!(store.meta_ad_account_id && store.meta_access_token),
        whatsapp: !!(store.wa_phone_number_id && store.wa_access_token),
      }
    });
  }

  const headers = { 'X-Shopify-Access-Token': store.access_token };
  const base = `https://${store.shop_domain}`;

  const safeJsonFetch = async (url) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers, timeout: DIAGNOSTIC_TIMEOUT });
      const latency_ms = Date.now() - t0;
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, latency_ms, data };
    } catch (e) {
      return { ok: false, status: 0, latency_ms: Date.now() - t0, error: e.message };
    }
  };

  const [shopRes, scopesRes, webhooksRes, themesRes] = await Promise.all([
    safeJsonFetch(`${base}/admin/api/${SHOPIFY_API_VERSION}/shop.json`),
    safeJsonFetch(`${base}/admin/oauth/access_scopes.json`),
    safeJsonFetch(`${base}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json?limit=250`),
    safeJsonFetch(`${base}/admin/api/${SHOPIFY_API_VERSION}/themes.json`),
  ]);

  const shop = shopRes.ok ? (shopRes.data?.shop || {}) : null;
  const grantedScopes = scopesRes.ok
    ? (scopesRes.data?.access_scopes || []).map(s => s.handle)
    : [];
  const missingScopes = scopesRes.ok
    ? REQUIRED_SCOPES.filter(reqScope => !grantedScopes.includes(reqScope))
    : [];

  const webhookItems = webhooksRes.ok
    ? (webhooksRes.data?.webhooks || []).map(w => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
        api_version: w.api_version,
        created_at: w.created_at,
      }))
    : [];
  const activeTopics = new Set(webhookItems.map(w => w.topic));
  const missingTopics = EXPECTED_WEBHOOK_TOPICS.filter(t => !activeTopics.has(t));
  const inventoryConflictWebhooks = webhookItems.filter(w => w.topic === 'inventory_levels/update');

  let themeInfo = { main_theme_name: null, main_theme_id: null, theme_count: 0, scope_missing: false };
  if (themesRes.ok && Array.isArray(themesRes.data?.themes)) {
    const main = themesRes.data.themes.find(t => t.role === 'main') || themesRes.data.themes[0];
    themeInfo = {
      main_theme_name: main?.name || null,
      main_theme_id: main?.id || null,
      theme_count: themesRes.data.themes.length,
      scope_missing: false,
    };
  } else if (themesRes.status === 403 || missingScopes.includes('read_themes')) {
    themeInfo.scope_missing = true;
  }

  res.json({
    success: true,
    checked_at: new Date().toISOString(),
    shopify: shop ? {
      connected: true,
      latency_ms: shopRes.latency_ms,
      shop_name: shop.name,
      primary_domain: shop.domain,
      myshopify_domain: shop.myshopify_domain,
      currency: shop.currency,
      plan: shop.plan_display_name || shop.plan_name,
      timezone: shop.iana_timezone,
    } : {
      connected: false,
      status: shopRes.status,
      latency_ms: shopRes.latency_ms,
      error: shopRes.error || `HTTP ${shopRes.status} — Token invalid or expired`,
    },
    scopes: {
      ok: scopesRes.ok,
      granted: grantedScopes,
      missing: missingScopes,
      total_required: REQUIRED_SCOPES.length,
    },
    webhooks: {
      ok: webhooksRes.ok,
      items: webhookItems,
      active_expected: EXPECTED_WEBHOOK_TOPICS.length - missingTopics.length,
      total_expected: EXPECTED_WEBHOOK_TOPICS.length,
      missing_topics: missingTopics,
      has_inventory_conflict: inventoryConflictWebhooks.length > 0,
      inventory_conflict_ids: inventoryConflictWebhooks.map(w => w.id),
    },
    theme: themeInfo,
    couriers: {
      postex: !!store.postex_token,
      instaworld: !!(store.instaworld_key || store.instaworld_key_backup || store.instaworld_key_3),
      leopards: !!store.leopards_token,
      tcs: !!store.tcs_token,
      google_maps: !!store.google_maps_key,
      meta_ads: !!(store.meta_ad_account_id && store.meta_access_token),
      whatsapp: !!(store.wa_phone_number_id && store.wa_access_token),
    }
  });
});

// DELETE /api/stores/:id/webhooks/:webhookId - Remove a specific Shopify webhook (e.g. rogue inventory_levels/update)
router.delete('/:id/webhooks/:webhookId', async (req, res) => {
  try {
    const store = db.prepare('SELECT shop_domain, access_token FROM stores WHERE id = ?').get(req.params.id);
    if (!store || !store.access_token || store.access_token === 'PENDING') {
      return res.status(404).json({ success: false, error: 'Store not connected' });
    }
    const delRes = await fetch(`https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${req.params.webhookId}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': store.access_token },
      timeout: DIAGNOSTIC_TIMEOUT,
    });
    if (!delRes.ok) {
      return res.status(delRes.status).json({ success: false, error: `Shopify returned HTTP ${delRes.status}` });
    }
    res.json({ success: true, message: 'Webhook removed from Shopify' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stores/:id/reauth - Generate fresh OAuth URL for existing store (upgrade scopes / renew token)
router.post('/:id/reauth', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found' });

    const clientId = (req.body?.client_id || store.shopify_client_id || '').trim();
    const clientSecret = (req.body?.client_secret || store.shopify_client_secret || '').trim();

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        needs_credentials: true,
        error: 'Client ID and Client Secret are required to re-authorize OAuth for this store.'
      });
    }

    if (req.body?.client_id || req.body?.client_secret) {
      db.prepare('UPDATE stores SET shopify_client_id = ?, shopify_client_secret = ? WHERE id = ?')
        .run(clientId, clientSecret, store.id);
    }

    global._tempSecrets = global._tempSecrets || {};
    global._tempSecrets[store.shop_domain] = clientSecret;

    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
    const appUrl = railwayDomain || process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = `${appUrl}/api/auth/callback`;
    const authUrl = `https://${store.shop_domain}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${TRACEPK_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    res.json({ success: true, auth_url: authUrl, redirect_uri: redirectUri });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stores/:id/abort-sync - Abort stuck or running historical sync
router.post('/:id/abort-sync', (req, res) => {
  try {
    const storeId = req.params.id;
    db.prepare("UPDATE stores SET sync_abort = 1, sync_status = 'idle', sync_progress = 'Aborted by user' WHERE id = ?").run(storeId);
    if (global.syncProgress && global.syncProgress[storeId]) {
      global.syncProgress[storeId].abort = true;
    }
    res.json({ success: true, message: 'Sync aborted & reset to idle' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stores/:id/test-courier - Live test PostEx or Instaworld API key (5s timeout)
router.post('/:id/test-courier', async (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found' });

    const { courier, token, proxy_url } = req.body || {};
    const t0 = Date.now();

    if (courier === 'postex') {
      const apiToken = (token !== undefined ? token : store.postex_token || '').trim();
      if (!apiToken) return res.status(400).json({ success: false, error: 'PostEx token is empty' });

      const r = await fetch('https://api.postex.pk/services/integration/api/order/v1/get-pickup-address', {
        method: 'GET',
        headers: { token: apiToken },
        timeout: DIAGNOSTIC_TIMEOUT,
      });
      const latency_ms = Date.now() - t0;
      const data = await r.json().catch(() => ({}));
      const ok = r.ok && (data.statusCode === '200' || Array.isArray(data.dist));
      return res.json({
        success: ok,
        latency_ms,
        message: ok
          ? `PostEx API OK (${Array.isArray(data.dist) ? data.dist.length : 0} pickup address(es) found)`
          : (data.statusMessage || `PostEx rejected token (HTTP ${r.status})`),
      });
    }

    if (courier === 'instaworld') {
      const apiKey = (token !== undefined ? token : store.instaworld_key || '').trim();
      if (!apiKey) return res.status(400).json({ success: false, error: 'Instaworld API key is empty' });
      const { instaworldFetch } = require('../engines/instaworld_http');
      const r = await instaworldFetch('https://one-be.instaworld.pk/logistics/v1/getCities', {
        method: 'GET',
        headers: { 'api-key': apiKey },
        proxyUrl: proxy_url !== undefined ? proxy_url : store.gas_proxy_url,
        timeout: DIAGNOSTIC_TIMEOUT,
      });
      const latency_ms = Date.now() - t0;
      const data = await r.json().catch(() => ({}));
      const ok = r.ok && (data.success !== false);
      return res.json({
        success: ok,
        latency_ms,
        message: ok ? 'Instaworld API connection verified!' : (data.message || `Instaworld returned HTTP ${r.status}`),
      });
    }

    res.status(400).json({ success: false, error: 'Unsupported courier test type (use postex or instaworld)' });
  } catch (e) {
    res.json({ success: false, message: `Connection failed: ${e.message}` });
  }
});

// POST /api/stores/:id/deep-sync - Trigger historical sync
router.post('/:id/deep-sync', async (req, res) => {
  const { fetchShopifyOrders } = require('../engines/shopify');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const { startDate, syncStatus = true, syncCosts = true } = req.body;

  // If a startDate is provided, temporarily override the store's sync_start_date
  const storeForSync = startDate
    ? { ...store, sync_start_date: startDate }
    : store;

  try {
    // Run sync in background (fire and forget)
    // Deep sync now handles both new orders and updates
    (async () => {
      await fetchShopifyOrders(storeForSync, null, { forceDeepSync: true });
      const { refreshShopifyUpdates } = require('../engines/shopify');
      await refreshShopifyUpdates(storeForSync, null, { forceDeepSync: true, syncStatus, syncCosts });
    })();

    res.json({ success: true, message: 'Historical deep sync started in background' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stores/:id/sync-order - Sync a single order by number (e.g. #16374)
router.post('/:id/sync-order', async (req, res) => {
  const { syncOrderByNumber } = require('../engines/shopify');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const { orderName } = req.body;
  if (!orderName) return res.status(400).json({ error: 'orderName required (e.g. #16374)' });

  try {
    const success = await syncOrderByNumber(store, orderName);
    if (success) {
      res.json({ success: true, message: `Order ${orderName} synced successfully` });
    } else {
      res.status(404).json({ error: `Order ${orderName} not found or failed to sync` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stores/:id/register-webhooks - Set up real-time sync
router.post('/:id/register-webhooks', async (req, res) => {
  const { registerShopifyWebhooks } = require('../engines/shopify');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  
  const { appUrl } = req.body;
  if (!appUrl) return res.status(400).json({ error: 'appUrl required' });

  try {
    const success = await registerShopifyWebhooks(store, appUrl);
    if (success) {
      res.json({ success: true, message: 'Webhooks registered successfully' });
    } else {
      res.status(500).json({ error: 'Failed to register one or more webhooks' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/stores/:id - Disconnect a store (deletes all its data)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/stores/:id/stats - Dashboard KPIs
router.get('/:id/stats', (req, res) => {
  const storeId = req.params.id;

  const total = db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id=?').get(storeId);
  const delivered = db.prepare("SELECT COUNT(*) as count FROM orders WHERE store_id=? AND LOWER(delivery_status)='delivered'").get(storeId);
  const returned = db.prepare("SELECT COUNT(*) as count FROM orders WHERE store_id=? AND LOWER(delivery_status) IN ('return received','returned')").get(storeId);
  
  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE store_id=? 
    AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
    AND LOWER(delivery_status) NOT IN ('delivered','return received','returned','cancelled','void','voided')
  `).get(storeId);
  
  const unbooked = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE store_id=? 
    AND (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
    AND LOWER(delivery_status) NOT IN ('delivered','return received','returned','cancelled','void','voided')
  `).get(storeId);
  
  const revenue = db.prepare("SELECT SUM(price) as total FROM orders WHERE store_id=? AND payment_status='Paid'").get(storeId);
  const stuck = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE store_id=?
    AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
    AND LOWER(delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','returned','void','voided')
    AND datetime(COALESCE(status_date, order_date)) < datetime('now', '-72 hours')
    AND tracking_number NOT IN (SELECT tracking_number FROM blacklist WHERE store_id = ?)
  `).get(storeId, storeId);

  const totalCount = total.count || 0;
  const deliveredCount = delivered.count || 0;
  const returnedCount = returned.count || 0;

  res.json({
    total_orders: totalCount,
    delivered: deliveredCount,
    returned: returnedCount,
    pending: pending.count || 0,
    unbooked: unbooked.count || 0,
    stuck: stuck.count || 0,
    delivery_rate: totalCount > 0 ? ((deliveredCount / totalCount) * 100).toFixed(1) : 0,
    rto_rate: totalCount > 0 ? ((returnedCount / totalCount) * 100).toFixed(1) : 0,
    revenue: (revenue.total || 0).toFixed(0)
  });
});

// ─── SAVED VIEWS ───
router.get('/:id/views', (req, res) => {
  const { type } = req.query;
  let views;
  if (type) {
    views = db.prepare('SELECT v.*, u.username as creator FROM saved_views v LEFT JOIN users u ON v.user_id = u.id WHERE v.store_id = ? AND (v.view_type = ? OR (v.view_type IS NULL AND ? = \'orders\')) ORDER BY v.created_at DESC').all(req.params.id, type, type);
  } else {
    views = db.prepare('SELECT v.*, u.username as creator FROM saved_views v LEFT JOIN users u ON v.user_id = u.id WHERE v.store_id = ? ORDER BY v.created_at DESC').all(req.params.id);
  }
  res.json(views);
});

router.post('/:id/views', (req, res) => {
  const { view_name, column_config, is_locked, view_type = 'orders' } = req.body;
  if (!view_name || !column_config) return res.status(400).json({ error: 'view_name and column_config required' });

  try {
    const existing = db.prepare('SELECT id FROM saved_views WHERE store_id = ? AND view_name = ? AND (view_type = ? OR (view_type IS NULL AND ? = \'orders\'))').get(req.params.id, view_name, view_type, view_type);
    if (existing) {
      db.prepare(`
        UPDATE saved_views 
        SET column_config = ?, is_locked = ?, user_id = ?, view_type = ?
        WHERE id = ?
      `).run(JSON.stringify(column_config), is_locked ? 1 : 0, req.user ? req.user.id : 1, view_type, existing.id);
    } else {
      db.prepare(`
        INSERT INTO saved_views (store_id, user_id, view_name, view_type, column_config, is_locked)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.params.id, req.user ? req.user.id : 1, view_name, view_type, JSON.stringify(column_config), is_locked ? 1 : 0);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:store_id/views/:view_id', (req, res) => {
  const view = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(req.params.view_id);
  if (!view) return res.status(404).json({ error: 'View not found' });

  // Only creator or admin can delete locked views
  if (view.is_locked && req.user.role !== 'admin' && view.user_id !== req.user.id) {
    return res.status(403).json({ error: 'This view is locked and can only be deleted by an admin or its creator.' });
  }

  db.prepare('DELETE FROM saved_views WHERE id = ?').run(req.params.view_id);
  res.json({ success: true });
});

router.post('/:store_id/views/:view_id/copy', (req, res) => {
  const { target_store_ids, target_store_id } = req.body;
  const sourceView = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(req.params.view_id);
  if (!sourceView) return res.status(404).json({ error: 'View not found' });

  // Resolve target store ids
  let targets = [];
  if (target_store_ids === 'all' || target_store_id === 'all') {
    const allStores = db.prepare('SELECT id, store_name FROM stores').all();
    targets = allStores.filter(s => String(s.id) !== String(sourceView.store_id));
  } else {
    const rawIds = target_store_ids || (target_store_id ? [target_store_id] : []);
    const idList = Array.isArray(rawIds) ? rawIds : [rawIds];
    if (idList.length > 0) {
      const placeholders = idList.map(() => '?').join(',');
      const allStores = db.prepare(`SELECT id, store_name FROM stores WHERE id IN (${placeholders})`).all(...idList);
      targets = allStores.filter(s => String(s.id) !== String(sourceView.store_id));
    }
  }

  if (targets.length === 0) {
    return res.status(400).json({ error: 'No valid target stores selected to copy this view' });
  }

  const userId = req.user ? req.user.id : (sourceView.user_id || 1);
  const copiedStoreNames = [];

  for (const target of targets) {
    const existing = db.prepare('SELECT id FROM saved_views WHERE store_id = ? AND view_name = ? AND (view_type = ? OR (view_type IS NULL AND ? = \'orders\'))')
      .get(target.id, sourceView.view_name, sourceView.view_type, sourceView.view_type);

    if (existing) {
      db.prepare(`
        UPDATE saved_views 
        SET column_config = ?, is_locked = ?, user_id = ?, view_type = ?
        WHERE id = ?
      `).run(sourceView.column_config, sourceView.is_locked, userId, sourceView.view_type, existing.id);
    } else {
      db.prepare(`
        INSERT INTO saved_views (store_id, user_id, view_name, view_type, column_config, is_locked)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(target.id, userId, sourceView.view_name, sourceView.view_type, sourceView.column_config, sourceView.is_locked);
    }
    copiedStoreNames.push(target.store_name || `Store #${target.id}`);
  }

  res.json({
    success: true,
    count: targets.length,
    stores: copiedStoreNames,
    message: `View "${sourceView.view_name}" copied to ${copiedStoreNames.join(', ')}`
  });
});

// POST /api/stores/:id/meta-config
router.post('/:id/meta-config', (req, res) => {
  const { ad_account_id, access_token, clear_token } = req.body || {};
  try {
    const current = db.prepare('SELECT meta_access_token FROM stores WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Store not found' });

    const nextToken = clear_token
      ? null
      : (access_token && String(access_token).trim() !== '' ? String(access_token).trim() : current.meta_access_token);

    db.prepare('UPDATE stores SET meta_ad_account_id = ?, meta_access_token = ? WHERE id = ?')
      .run((ad_account_id || '').trim() || null, nextToken, req.params.id);
    res.json({ success: true, has_meta_token: !!nextToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
