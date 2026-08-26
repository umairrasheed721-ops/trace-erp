const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db, DB_DIR } = require('../db');
const startup = require('../startup');

// --- 🛡️ SAFE ROUTE LOADER ---
const moduleRegistry = {};

function safeRequire(modulePath, label) {
  try {
    const mod = require(modulePath);
    moduleRegistry[label] = { status: 'OK', error: null, loadedAt: new Date().toISOString() };
    console.log(`✅ Loaded: ${label}`);
    return mod;
  } catch (err) {
    moduleRegistry[label] = { status: 'FAILED', error: err.message, loadedAt: new Date().toISOString() };
    console.error(`⚠️ Failed to load ${label}: ${err.message}`);
    const { Router } = require('express');
    const fallback = Router();
    fallback.all('*', (req, res) => res.status(503).json({
      error: `${label} module failed to load`,
      details: err.message,
      fix: 'Check /api/admin/system-status for details'
    }));
    return fallback;
  }
}

// Load routes relative to routes directory
const { router: authRoutes } = require('./auth');
const ordersRoutes      = safeRequire('./orders',       'Orders');
const trackingRoutes    = safeRequire('./tracking',     'Tracking');
const storesRoutes      = safeRequire('./stores',       'Stores');
const financeRoutes     = safeRequire('./finance',      'Finance');
const reportsRoutes     = safeRequire('./reports',      'Reports');
const usersRoutes       = safeRequire('./users',        'Users');
const webhooksRoutes    = safeRequire('./webhooks',     'Webhooks');
const publicRoutes      = safeRequire('./public',       'Public');
const templatesRoutes   = safeRequire('./templates',    'Templates');
const statusMappingsRoutes = safeRequire('./status-mappings', 'StatusMappings');
const schedulerRoutes   = safeRequire('./scheduler',    'SchedulerAPI');
const costManagerRoutes = safeRequire('./cost-manager', 'CostManager');
const syncRoutes        = safeRequire('./sync',         'Sync');
const customerSuccessRoutes = safeRequire('./customer-success', 'CustomerSuccess');
const settingsRoutes    = safeRequire('./settings',     'Settings');
const citiesRoutes      = require('./cities');
const bulkRoutes        = require('./bulk_booking');
const postexRoutes      = safeRequire('./postex',       'PostEx');
const reviewsRoutes     = safeRequire('./reviews',      'Reviews');
const abandonedRoutes   = safeRequire('./abandoned',    'Abandoned');
const shipperAdviceRoutes = safeRequire('./shipper-advice', 'ShipperAdvice');
const expensesRoutes    = safeRequire('./expenses',     'Expenses');

// Register routes
router.use('/api/auth', authRoutes);
router.use('/api/stores', storesRoutes);
router.use('/api/orders', ordersRoutes);
router.use('/api/tracking', trackingRoutes);
router.use('/api/shipper-advice', shipperAdviceRoutes);
router.use('/api/finance', financeRoutes);
router.use('/api/reports', reportsRoutes);
router.use('/api/users', usersRoutes);
router.use('/api/webhooks', webhooksRoutes);
router.use('/api/public', publicRoutes);
router.use('/api/templates', templatesRoutes);
router.use('/api/status-mappings', statusMappingsRoutes);
router.use('/api/cost-manager', costManagerRoutes);
router.use('/api/sync', syncRoutes);
router.use('/api/scheduler', schedulerRoutes);
router.use('/api/customer-success', customerSuccessRoutes);
router.use('/api/settings', settingsRoutes);
router.use('/api/cities', citiesRoutes);
router.use('/api/bulk', bulkRoutes);
router.use('/api/postex', postexRoutes);
router.use('/api/reviews', reviewsRoutes);
router.use('/api/abandoned', abandonedRoutes);
router.use('/api/expenses', expensesRoutes);

// --- 🔄 AUTO-RETRY FAILED MODULES (every 90s) ---
const ROUTE_MAP = {
  'Orders':      ['/api/orders',      './orders'],
  'Tracking':    ['/api/tracking',    './tracking'],
  'Stores':      ['/api/stores',      './stores'],
  'Finance':     ['/api/finance',     './finance'],
  'Reports':     ['/api/reports',     './reports'],
  'Users':       ['/api/users',       './users'],
  'WhatsApp':    ['/api/whatsapp',    './whatsapp'],
  'Templates':   ['/api/templates',   './templates'],
  'CostManager': ['/api/cost-manager', './cost-manager'],
  'Settings':    ['/api/settings',    './settings'],
};

setInterval(() => {
  const failed = Object.entries(moduleRegistry).filter(([, v]) => v.status === 'FAILED');
  if (failed.length === 0) return;

  for (const [label] of failed) {
    const mapping = ROUTE_MAP[label];
    if (!mapping) continue;
    const [routePath, modulePath] = mapping;
    try {
      delete require.cache[require.resolve(modulePath)];
      const mod = require(modulePath);
      moduleRegistry[label] = { status: 'OK', error: null, loadedAt: new Date().toISOString(), autoHealed: true };
      router.use(routePath, mod);
      console.log(`🩹 Auto-healed module: ${label} → now serving ${routePath}`);
      try {
        db.logSystemError('INFO', `Auto-healed module: ${label}`, 'auto-retry');
      } catch (_) {}
    } catch (err) {
      console.warn(`⏳ Auto-retry failed for ${label}: ${err.message}`);
      moduleRegistry[label].error = err.message;
    }
  }
}, 90000);

// --- OTHER SPECIFIC ROUTES FROM index.js ---

router.get('/api/wake-up-test', (req, res) => res.json({ message: "🚀 RAILWAY IS ALIVE AND UPDATED!", time: new Date().toISOString() }));

// ⚡ AUTOMATIC MULTI-STORE METAFIEILD REGISTRATION ENDPOINT ⚡
router.get('/api/public/sync-metafields-all', async (req, res) => {
  const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
  const DEFINITIONS = [
    { name: 'Show Buy Bundle Button', key: 'show_bundle_button', type: 'boolean', description: 'Enable CHOOSE BUNDLE button on collection card' },
    { name: 'Bundle Deal Target', key: 'bundle_deal_target', type: 'single_line_text_field', description: 'Target deal parameter (e.g. addon_3, addon_2) or custom URL' },
    { name: 'Bundle Button Text', key: 'bundle_button_text', type: 'single_line_text_field', description: 'Custom text for collection card bundle button (e.g. BUY BUNDLE)' },
    { name: 'Bundle Addon Products', key: 'bundle_addon_products', type: 'list.product_reference', description: 'List of add-on products shown as combo tiers in CRO funnel' },
    { name: '2-in-1 Combo Discount Code', key: 'bundle_2in1_discount_code', type: 'single_line_text_field', description: 'Discount code auto-applied at checkout for 2-in-1 combo' },
    { name: '3-Piece Set Discount Code', key: 'bundle_3in1_discount_code', type: 'single_line_text_field', description: 'Discount code auto-applied at checkout for 3-piece set' },
    { name: 'VIP 4-Piece Discount Code', key: 'bundle_4in1_discount_code', type: 'single_line_text_field', description: 'Discount code auto-applied at checkout for VIP 4-piece mega pack' },
    { name: '2-in-1 Combo Discount Amount (Rs)', key: 'bundle_2in1_discount_amount', type: 'number_integer', description: 'Discount amount subtracted for 2-in-1 combo' },
    { name: '3-Piece Set Discount Amount (Rs)', key: 'bundle_3in1_discount_amount', type: 'number_integer', description: 'Discount amount subtracted for 3-piece set' },
    { name: 'VIP 4-Piece Discount Amount (Rs)', key: 'bundle_4in1_discount_amount', type: 'number_integer', description: 'Discount amount subtracted for VIP 4-piece mega pack' },
    { name: 'Redirect Target Product', key: 'redirect_target_product', type: 'product_reference', description: 'Target Product to redirect customer to' },
    { name: 'Redirect Default Deal', key: 'redirect_default_deal', type: 'single_line_text_field', description: 'Default Deal to pre-select (addon_2, addon_3)' },
    { name: 'Linked Color Products', key: 'linked_color_products', type: 'list.product_reference', description: 'Linked Color Products for swatches' },
    { name: 'Size Chart', key: 'size_chart', type: 'file_reference', description: 'Size Chart Image' },
    { name: 'Product Video', key: 'product_video', type: 'file_reference', description: 'Product Video MP4 file' },
    { name: 'Advance Only', key: 'advance_only', type: 'boolean', description: 'Require 100% advance payment' },
    { name: 'Hide Bundles', key: 'hide_bundles', type: 'boolean', description: 'Hide package bundle deals for product' }
  ];

  const query = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id name namespace key type { name } }
        userErrors { field message }
      }
    }
  `;

  try {
    const stores = db.prepare("SELECT id, shop_domain, store_name, access_token FROM stores WHERE access_token IS NOT NULL AND access_token != 'PENDING'").all();
    const results = [];

    for (const store of stores) {
      const storeRes = { id: store.id, name: store.store_name, domain: store.shop_domain, registered: [], skipped: [], errors: [] };
      for (const def of DEFINITIONS) {
        try {
          const res = await fetch(`https://${store.shop_domain}/admin/api/2024-10/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': store.access_token
            },
            body: JSON.stringify({ query, variables: { definition: { name: def.name, namespace: 'custom', key: def.key, type: def.type, ownerType: 'PRODUCT', description: def.description } } })
          });
          const data = await res.json();
          const created = data?.data?.metafieldDefinitionCreate?.createdDefinition;
          const userErrors = data?.data?.metafieldDefinitionCreate?.userErrors;

          if (created) {
            storeRes.registered.push(`custom.${def.key} (${created.name})`);
          } else if (userErrors && userErrors.length > 0) {
            storeRes.skipped.push(`custom.${def.key}: ${userErrors[0].message}`);
          } else {
            storeRes.errors.push(`custom.${def.key}: ${JSON.stringify(data.errors || data)}`);
          }
        } catch (err) {
          storeRes.errors.push(`custom.${def.key}: ${err.message}`);
        }
      }
      results.push(storeRes);
    }

    res.json({ success: true, totalStores: stores.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ⚡ AUTOMATIC MULTI-STORE THEME DEPLOYMENT ENDPOINT ⚡
router.get('/api/public/deploy-theme-all', async (req, res) => {
  const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
  const fs = require('fs');
  const path = require('path');

  const filesToUpload = [
    'snippets/trace-cro-funnel.liquid',
    'layout/theme.liquid',
    'snippets/product-thumbnail.liquid',
    'snippets/price.liquid',
    'snippets/card-product.liquid',
    'assets/base.css',
    'assets/trace-whatsapp-community.js',
    'snippets/trace-cod-checkout.liquid',
    'snippets/trace-floating-video.liquid',
    'sections/custom-hero-slider.liquid',
    'sections/header.liquid',
    'sections/footer.liquid',
    'config/settings_schema.json',
    'sections/trace-reviews.liquid',
    'snippets/trace-reviews.liquid',
    'snippets/cart-drawer.liquid',
    'snippets/cart-notification.liquid',
    'sections/main-cart-footer.liquid',
    'snippets/buy-buttons.liquid',
    'sections/main-product.liquid',
    'assets/section-main-product.css'
  ];

  const themeDir = path.join(__dirname, '../../shopify_theme');

  try {
    const stores = db.prepare("SELECT id, shop_domain, store_name, access_token FROM stores WHERE access_token IS NOT NULL AND access_token != 'PENDING'").all();
    const results = [];

    for (const store of stores) {
      const storeRes = { id: store.id, name: store.store_name, domain: store.shop_domain, themeId: null, uploaded: [], errors: [] };

      // 1. Fetch main published theme ID
      try {
        const themeRes = await fetch(`https://${store.shop_domain}/admin/api/2024-10/themes.json`, {
          headers: { 'X-Shopify-Access-Token': store.access_token }
        });
        const themeData = await themeRes.json();
        const themesList = themeData.themes || [];
        storeRes.allThemes = themesList.map(t => ({ id: t.id, name: t.name, role: t.role }));

        const mainTheme = themesList.find(t => t.role === 'main') || themesList.find(t => t.role === 'unpublished' || t.role === 'unpublished_main') || themesList[0];

        if (!mainTheme) {
          storeRes.errors.push(`No theme found in shop. Raw response: ${JSON.stringify(themeData)}`);
          results.push(storeRes);
          continue;
        }

        storeRes.themeId = mainTheme.id;

        // 2. Upload each file to main theme
        for (const key of filesToUpload) {
          const localPath = path.join(themeDir, key);
          if (!fs.existsSync(localPath)) continue;

          const isBinary = localPath.endsWith('.woff2') || localPath.endsWith('.png') || localPath.endsWith('.jpg') || localPath.endsWith('.gif');
          const payload = { asset: { key } };
          if (isBinary) {
            payload.asset.attachment = fs.readFileSync(localPath).toString('base64');
          } else {
            payload.asset.value = fs.readFileSync(localPath, 'utf8');
          }

          const upRes = await fetch(`https://${store.shop_domain}/admin/api/2024-10/themes/${mainTheme.id}/assets.json`, {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': store.access_token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (upRes.ok) {
            storeRes.uploaded.push(key);
          } else {
            const errTxt = await upRes.text();
            storeRes.errors.push(`${key}: HTTP ${upRes.status} - ${errTxt.slice(0, 80)}`);
          }
        }
      } catch (err) {
        storeRes.errors.push(`Store error: ${err.message}`);
      }

      results.push(storeRes);
    }

    res.json({ success: true, totalStores: stores.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ⚡ AUTOMATIC STORE THEME ASSET UPLOAD ENDPOINT ⚡
router.post('/api/public/upload-theme-asset', async (req, res) => {
  const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
  const { store_id, domain, key, value, attachment } = req.body;

  if (!key || (!value && !attachment)) {
    return res.status(400).json({ error: 'key and value/attachment required' });
  }

  try {
    let store;
    if (store_id) {
      store = db.prepare('SELECT id, shop_domain, access_token FROM stores WHERE id = ?').get(Number(store_id));
    } else if (domain) {
      store = db.prepare('SELECT id, shop_domain, access_token FROM stores WHERE shop_domain = ? OR shop_domain LIKE ?').get(domain, `%${domain}%`);
    } else {
      store = db.prepare("SELECT id, shop_domain, access_token FROM stores WHERE access_token IS NOT NULL AND access_token != 'PENDING' LIMIT 1").get();
    }

    if (!store || !store.access_token) {
      return res.status(404).json({ error: 'Store not found or token missing' });
    }

    // 1. Fetch main published theme ID
    const themeRes = await fetch(`https://${store.shop_domain}/admin/api/2024-10/themes.json`, {
      headers: { 'X-Shopify-Access-Token': store.access_token }
    });
    const themeData = await themeRes.json();
    const themesList = themeData.themes || [];
    const mainTheme = themesList.find(t => t.role === 'main') || themesList[0];

    if (!mainTheme) {
      return res.status(404).json({ error: 'No theme found on store' });
    }

    // 2. Upload asset payload
    const payload = { asset: { key } };
    if (attachment) payload.asset.attachment = attachment;
    else payload.asset.value = value;

    const upRes = await fetch(`https://${store.shop_domain}/admin/api/2024-10/themes/${mainTheme.id}/assets.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const upData = await upRes.json();
    if (upRes.ok) {
      res.json({ success: true, store: store.shop_domain, themeId: mainTheme.id, key });
    } else {
      res.status(upRes.status).json({ success: false, store: store.shop_domain, error: upData });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/admin/system-status', (req, res) => {
  const mem = process.memoryUsage();
  const toMB = (b) => (b / 1024 / 1024).toFixed(1);

  let persistentErrors = [];
  try {
    persistentErrors = db.prepare(
      `SELECT level, message, module, created_at FROM system_logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 30`
    ).all();
  } catch (_) {}

  const stats = startup.getStats();

  res.json({
    server: {
      status: 'ALIVE',
      uptime: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      nodeVersion: process.version,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      errorCount: stats.errorCount,
      errorsPerMinute: stats.recentErrorTimes.length,
      highMemoryStrikes: stats.highMemoryStrikes,
    },
    memory: {
      rss: toMB(mem.rss),
      heapUsed: toMB(mem.heapUsed),
      heapTotal: toMB(mem.heapTotal),
      external: toMB(mem.external),
      limitMB: 512,
      percentUsed: ((mem.rss / 1024 / 1024) / 512 * 100).toFixed(1),
    },
    modules: moduleRegistry,
    recentLogs: stats.logBuffer.slice(-100),
    recentErrors: stats.logBuffer.filter(l => l.level === 'ERROR').slice(-20),
    persistentErrors,
  });
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

router.get('/api/admin/logs', (req, res) => {
  const stats = startup.getStats();
  res.setHeader('Content-Type', 'text/plain');
  res.send(stats.logBuffer.map(l => `[${l.ts}] ${l.level}: ${l.msg}`).join('\n'));
});

// Incoming media local proxy serving route (prevents ephemeral link expiry)
router.get('/api/media/:filename', async (req, res) => {
  try {
    const fsPromises = require('fs').promises;
    const filename = path.basename(req.params.filename);
    const storageDir = process.env.MEDIA_STORAGE_DIR 
      ? path.resolve(process.env.MEDIA_STORAGE_DIR)
      : path.join(DB_DIR || '/app/data', 'media');
    let filePath = path.join(storageDir, filename);

    try {
      await fsPromises.access(filePath);
    } catch (err) {
      const fallbackPath = path.join(process.cwd(), 'storage', 'media', filename);
      try {
        await fsPromises.access(fallbackPath);
        filePath = fallbackPath;
      } catch (fallbackErr) {
        console.warn(`⚠️ Media file not found: ${filePath}`);
        return res.status(404).json({ error: 'Media file not found' });
      }
    }

    const userTenantId = req.user?.tenant_id || 'default';
    const targetUrl = `/api/media/${filename}`;

    const tenantContext = require('../tenant-context');
    const hasMedia = tenantContext.run(userTenantId, () => {
      const { db } = require('../db');
      try {
        const row = db.prepare("SELECT id FROM whatsapp_messages WHERE media_url = ? LIMIT 1").get(targetUrl);
        return !!row;
      } catch (err) {
        console.error(`Error querying media in tenant [${userTenantId}]:`, err.message);
        return false;
      }
    });

    if (!hasMedia) {
      console.error(`🛑 Access denied: Media file [${filename}] does not belong to tenant [${userTenantId}]`);
      return res.status(403).json({ error: 'Access denied: Tenant mismatch or media not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  } catch (error) {
    console.error(`[MEDIA_PROXY_ROUTE_ERROR]: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error serving media proxy' });
  }
});

// Indestructible Health Check
router.get('/api/health', (req, res) => {
  let waBotStatus = 'DECOUPLED';
  try {
    const botPath = require.resolve('../engines/whatsapp_bot');
    const waBot = require.cache[botPath]?.exports;
    if (waBot) waBotStatus = waBot.getStatus().status;
  } catch (_) {}

  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    wa_bot: waBotStatus,
    failedModules: Object.entries(moduleRegistry)
      .filter(([, v]) => v.status === 'FAILED')
      .map(([k]) => k),
  });
});

const { addClient } = require('../sse');

// Live Real-Time Events endpoint
router.get('/api/live', (req, res) => {
  addClient(req, res);
});

// Health check
router.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

module.exports = router;
