// Uses Node.js v22+ built-in sqlite (no npm install needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const tenantContext = require('./tenant-context');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);

// Ensure the parent directory exists (important for Railway volume mounts)
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`📁 Created database directory: ${DB_DIR}`);
}

const dbInstances = {};

function getDbInstance() {
  const tenantId = tenantContext.getStore() || 'default';
  if (!dbInstances[tenantId]) {
    const dbPath = tenantId === 'default'
      ? DB_PATH
      : path.resolve(path.join(DB_DIR, `trace_erp_${tenantId}.db`));
    
    // Ensure the parent directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    console.log("Connecting to DB at:", dbPath);
    console.log(`🔌 [Multi-Tenant DB] Opening database for tenant [${tenantId}] at: ${dbPath}`);
    const conn = new DatabaseSync(dbPath);
    dbInstances[tenantId] = conn;
    
    // Initialize schema on the new connection
    initDb(conn);
  }
  return dbInstances[tenantId];
}

const db = new Proxy({}, {
  get(target, prop) {
    const conn = getDbInstance();
    const val = conn[prop];
    if (typeof val === 'function') {
      return val.bind(conn);
    }
    return val;
  }
});


function initDb(db) {
  // --- ⚡ PERFORMANCE PRAGMAs ---
  db.exec(`PRAGMA journal_mode = WAL`);
  db.exec(`PRAGMA synchronous = NORMAL`);       // Faster writes, safe with WAL
  db.exec(`PRAGMA cache_size = -32000`);         // 32MB page cache
  db.exec(`PRAGMA temp_store = MEMORY`);         // Temp tables in RAM
  db.exec(`PRAGMA mmap_size = 536870912`);       // 512MB memory-mapped I/O
  db.exec(`PRAGMA foreign_keys = ON`);
  db.exec(`PRAGMA busy_timeout = 5000`);         // Wait 5s instead of failing on lock
  db.exec(`PRAGMA wal_autocheckpoint = 1000`);   // Checkpoint every 1000 pages

  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT UNIQUE NOT NULL,
      store_name TEXT NOT NULL DEFAULT 'My Store',
      access_token TEXT NOT NULL,
      shopify_client_id TEXT,
      postex_token TEXT,
      instaworld_key TEXT,
      instaworld_key_backup TEXT,
      postex_track_url TEXT DEFAULT 'https://api.postex.pk/services/integration/api/order/v1/track-order/',
      instaworld_track_url TEXT DEFAULT 'https://one-be.instaworld.pk/logistics/v1/trackShipment',
      last_synced_at TEXT,
      sync_start_date TEXT,
      sync_status TEXT DEFAULT 'idle',
      sync_progress TEXT,
      sync_total INTEGER DEFAULT 0,
      sync_processed INTEGER DEFAULT 0,
      meta_ad_account_id TEXT,
      meta_access_token TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      shopify_order_id TEXT NOT NULL,
      ref_number TEXT,
      customer_name TEXT,
      order_date TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      price REAL,
      tracking_number TEXT,
      items_count INTEGER,
      notes TEXT,
      product_titles TEXT,
      line_items TEXT, -- Store JSON data of items (title, qty, price, image)
      delivery_status TEXT DEFAULT 'Pending',
      payment_status TEXT DEFAULT 'Pending',
      postex_weight REAL DEFAULT 0.5,
      courier TEXT,
      cost REAL DEFAULT 0,
      packaging_cost REAL DEFAULT 0,
      courier_fee REAL DEFAULT 0,
      payment_ref TEXT,
      paid_amount REAL DEFAULT 0,
      payment_date TEXT,
      return_status TEXT,
      hold_reason TEXT,
      status_date TEXT,
      created_timestamp TEXT DEFAULT (datetime('now')),
      order_source TEXT DEFAULT 'Direct / Web',
      cost_locked INTEGER DEFAULT 0,
      courier_fee_locked INTEGER DEFAULT 0,
      confirmation_token TEXT,
      cs_notes TEXT,
      discount_amount REAL DEFAULT 0,
      financial_status TEXT DEFAULT 'pending',
      fulfillment_status TEXT DEFAULT 'unfulfilled',
      total_price REAL DEFAULT 0,
      UNIQUE(store_id, shopify_order_id)
    );
  `);

  // --- 🔄 DATABASE MIGRATIONS (Add new columns to existing table) ---
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN cs_notes TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN message_id TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN media_url TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN media_type TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN created_at TEXT DEFAULT (datetime('now', '+5 hours'))`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msgs_message_id ON whatsapp_messages(message_id)`);
  } catch (e) { /* Index already exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      shopify_product_id TEXT,
      shopify_variant_id TEXT,
      sku TEXT,
      title TEXT,
      image_url TEXT,
      price REAL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, shopify_variant_id)
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      tracking_number TEXT NOT NULL,
      date_added TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, tracking_number)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'custom', -- 'confirmation', 'address', 'shipping', 'custom'
      is_default INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchdog_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      tracking_number TEXT NOT NULL,
      request_time TEXT,
      latest_status TEXT,
      verdict TEXT,
      duration TEXT,
      evidence TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, tracking_number)
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      date_string TEXT NOT NULL,
      marketing_spend REAL DEFAULT 0,
      tiktok_marketing REAL DEFAULT 0,
      actual_exp REAL DEFAULT 0,
      diff_correction REAL DEFAULT 0,
      UNIQUE(store_id, date_string)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_store    ON orders(store_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tracking  ON orders(tracking_number);
    CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(delivery_status);
    CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status_date);
    CREATE INDEX IF NOT EXISTS idx_orders_date      ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_orders_phone     ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_customer  ON orders(customer_name);
    CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, delivery_status);
    CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status_lower ON orders(LOWER(delivery_status));
    CREATE INDEX IF NOT EXISTS idx_orders_courier_lower ON orders(LOWER(courier));
    CREATE INDEX IF NOT EXISTS idx_orders_store_status_lower ON orders(store_id, LOWER(delivery_status));
    
    CREATE TABLE IF NOT EXISTS sync_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'agent',
      permissions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recon_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      filename TEXT,
      row_count INTEGER,
      sync_to_shopify BOOLEAN,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recon_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES recon_sessions(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      old_delivery_status TEXT,
      old_payment_status TEXT,
      old_courier_fee REAL,
      old_paid_amount REAL,
      old_payment_ref TEXT,
      old_payment_date TEXT,
      shopify_note_added TEXT -- The specific line we added to the Shopify note
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view_name TEXT NOT NULL,
      column_config TEXT NOT NULL, -- JSON array of column IDs
      is_locked BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, view_name)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER,
      order_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT, -- JSON string
      snapshot TEXT, -- Detailed state snapshot for debugging
      level TEXT DEFAULT 'INFO', -- 'INFO', 'WARN', 'ERROR'
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      change_type TEXT NOT NULL, -- 'STATUS', 'COST', 'ADDRESS', 'MANUAL_EDIT'
      old_value TEXT, -- JSON
      new_value TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS returns_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      tracking_number TEXT,
      restocked_shopify INTEGER DEFAULT 0,
      processed_by TEXT, 
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );

    CREATE TABLE IF NOT EXISTS cpr_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      courier TEXT NOT NULL,
      cpr_reference TEXT NOT NULL,
      settlement_date TEXT,
      total_orders INTEGER DEFAULT 0,
      total_cod REAL DEFAULT 0,
      total_expense REAL DEFAULT 0,
      net_payout REAL DEFAULT 0,
      actual_bank_deposit REAL DEFAULT 0,
      discrepancy_amount REAL DEFAULT 0,
      discrepancy_reason TEXT,
      audit_status TEXT DEFAULT 'CLEARED',
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+5 hours')),
      UNIQUE(store_id, courier, cpr_reference)
    );

    CREATE TABLE IF NOT EXISTS cpr_settlement_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cpr_id INTEGER NOT NULL REFERENCES cpr_settlements(id) ON DELETE CASCADE,
      order_ref TEXT,
      tracking_number TEXT,
      status TEXT,
      amount_collected REAL DEFAULT 0,
      total_expense REAL DEFAULT 0,
      cpr_reference TEXT,
      settlement_date TEXT
    );
  `);


  runMigrations(db);

  // Persistent system error log (survives restarts unlike in-memory logBuffer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'INFO',
      message TEXT NOT NULL,
      module TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_syslogs_level   ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_syslogs_created ON system_logs(created_at DESC);
  `);

  // WhatsApp session store — persists Baileys creds across Railway deployments
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_session_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS wa_lid_mappings (
      lid TEXT PRIMARY KEY,
      phone TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_master_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      shopify_variant_id TEXT,
      parent_title TEXT NOT NULL,
      variant_title TEXT NOT NULL DEFAULT '',
      sku TEXT,
      unit_cost REAL DEFAULT 0,
      previous_unit_cost REAL DEFAULT 0,
      packaging_cost REAL DEFAULT 0,
      landed_cost REAL DEFAULT 0,
      inventory_qty INTEGER DEFAULT 0,
      shopify_cost REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, parent_title, variant_title)
    );
    CREATE INDEX IF NOT EXISTS idx_master_variant_id ON product_master_costs(shopify_variant_id);
  `);



  db.exec(`
    CREATE TABLE IF NOT EXISTS courier_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courier TEXT,
      city_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(courier, city_name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS city_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_input TEXT NOT NULL UNIQUE,
      corrected_name TEXT NOT NULL,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL,
      page_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(role_name, page_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT, -- 'image' or 'video'
      caption TEXT,
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_quick_pills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pill_text TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `);

  // Seed default quick-reply pills if empty
  try {
    const pillCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_quick_pills').get().count;
    if (pillCount === 0) {
      const defaultPills = [
        "👋 Sir, kindly confirm your nearest landmark for delivery.",
        "📦 Aapka parcel PostEx ko hand over kar diya hai.",
        "⚠️ Rider aapki location par hai, kindly phone attend karein.",
        "✅ Order confirm karne ka shukriya!"
      ];
      const insertPill = db.prepare('INSERT INTO whatsapp_quick_pills (pill_text, sort_order) VALUES (?, ?)');
      defaultPills.forEach((text, index) => {
        insertPill.run(text, index);
      });
      console.log('💊 Seeded default WhatsApp quick-reply pills');
    }
  } catch (e) {
    console.error('Failed to seed quick-reply pills:', e.message);
  }

  // Initial Admin User
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    try {
      const bcrypt = require('bcryptjs');
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('admin123', salt);
      db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hash);
      console.log('👤 Created default admin user: admin / admin123');
    } catch (e) { console.error('Failed to create default admin:', e.message); }
  }

  console.log('✅ Database initialized at', db.path || DB_PATH);
}

// Pre-initialize default tenant database
getDbInstance();

// Helper wrappers to mimic better-sqlite3's API pattern
// so the rest of the code doesn't need to change

// --- ⚡ PREPARED STATEMENT CACHE ---
// Compiles each SQL statement ONCE per tenant and reuses it — huge speed gain.
const _prepare_caches = {};

function getPrepared(sql) {
  const tenantId = tenantContext.getStore() || 'default';
  if (!_prepare_caches[tenantId]) {
    _prepare_caches[tenantId] = new Map();
  }
  const cache = _prepare_caches[tenantId];
  if (!cache.has(sql)) {
    const conn = getDbInstance();
    cache.set(sql, conn.prepare(sql));
  }
  return cache.get(sql);
}

function prepare(sql) {
  return {
    get: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).get(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    },
    all: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).all(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    },
    run: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).run(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    }
  };
}

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
}

function logAction({ store_id, order_id, user_id, action, details, snapshot, level = 'INFO' }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (store_id, order_id, user_id, action, details, snapshot, level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id ?? null,
      order_id ?? null,
      user_id ?? null,
      action ?? null,
      typeof details === 'object' ? JSON.stringify(details) : (details ?? null),
      typeof snapshot === 'object' ? JSON.stringify(snapshot) : (snapshot ?? null),
      level
    );
  } catch (err) {
    console.error('❌ Failed to write audit log:', err.message);
  }
}

function logOrderChange({ order_id, user_id, type, old_val, new_val }) {
  try {
    // Only log if something actually changed
    const oldStr = JSON.stringify(old_val);
    const newStr = JSON.stringify(new_val);
    if (oldStr === newStr) return;

    db.prepare(`
      INSERT INTO order_history (order_id, user_id, change_type, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(order_id ?? null, user_id ?? null, type ?? null, oldStr, newStr);
  } catch (err) {
    console.error('❌ Failed to log order change:', err.message);
  }
}

function logSystemError(level, message, module = 'server') {
  try {
    db.prepare(`INSERT INTO system_logs (level, message, module) VALUES (?, ?, ?)`)
      .run(level, message.substring(0, 2000), module);
  } catch (_) { } // Never let error logging crash anything
}

module.exports = { db, prepare, transaction, exec: (sql) => db.exec(sql), logAction, logOrderChange, logSystemError, DB_DIR, DB_PATH, isProduction };
try { db.prepare("ALTER TABLE stores ADD COLUMN sync_total INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE stores ADD COLUMN sync_processed INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE audit_logs ADD COLUMN snapshot TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE orders ADD COLUMN cost_locked INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE orders ADD COLUMN courier_fee_locked INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE orders ADD COLUMN packaging_cost REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE product_master_costs ADD COLUMN previous_unit_cost REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sync_audit ADD COLUMN store_id INTEGER").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sync_audit ADD COLUMN level TEXT DEFAULT 'INFO'").run(); } catch (e) { }
try { db.prepare("CREATE INDEX IF NOT EXISTS idx_sync_audit_store ON sync_audit(store_id)").run(); } catch (e) { }
try { db.prepare("CREATE INDEX IF NOT EXISTS idx_sync_audit_level ON sync_audit(level)").run(); } catch (e) { }
try { db.prepare("ALTER TABLE stores ADD COLUMN meta_ad_account_id TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE stores ADD COLUMN meta_access_token TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE stores ADD COLUMN instaworld_key_3 TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE stores ADD COLUMN gas_proxy_url TEXT").run(); } catch (e) { }

function runMigrations(db) {
  const migrations = [
    { table: 'orders', column: 'confirmation_token', type: 'TEXT' },
    { table: 'orders', column: 'courier_status', type: 'TEXT DEFAULT NULL' },          // raw courier API status
    { table: 'orders', column: 'failed_attempts', type: 'INTEGER DEFAULT 0' },
    { table: 'stores', column: 'sync_progress', type: 'TEXT' },
    { table: 'product_master_costs', column: 'variant_title', type: 'TEXT NOT NULL DEFAULT ""' },
    { table: 'product_master_costs', column: 'selling_price', type: 'REAL DEFAULT 0' },
    { table: 'product_master_costs', column: 'shopify_variant_id', type: 'TEXT' },
    { table: 'whatsapp_templates', column: 'status', type: "TEXT DEFAULT 'active'" },
    { table: 'users', column: 'can_override_erp_status', type: 'INTEGER DEFAULT 0' },  // manual ERP status authority
    { table: 'product_master_costs', column: 'sku', type: 'TEXT' },
    // Phase 3: WhatsApp Verification & Self-Service Tracking Portal
    { table: 'orders', column: 'wa_verification_status', type: "TEXT DEFAULT 'Pending'" },
    { table: 'orders', column: 'wa_message_id', type: 'TEXT' },
    { table: 'orders', column: 'wa_interaction_logs', type: "TEXT DEFAULT '[]'" },
    { table: 'orders', column: 'address_quality_score', type: 'INTEGER DEFAULT 100' },
    { table: 'orders', column: 'tracking_slug', type: 'TEXT' },
    { table: 'orders', column: 'customer_gps_lat', type: 'REAL' },
    { table: 'orders', column: 'customer_gps_lng', type: 'REAL' },
    { table: 'orders', column: 'customer_dispatch_instructions', type: 'TEXT' },
    { table: 'orders', column: 'rescue_submitted_at', type: 'TEXT' },
    { table: 'orders', column: 'courier_ticket_id', type: 'TEXT' },
    { table: 'stores', column: 'wa_phone_number_id', type: 'TEXT' },
    { table: 'stores', column: 'wa_access_token', type: 'TEXT' },
    { table: 'stores', column: 'wa_webhook_verify_token', type: 'TEXT' },
    { table: 'orders', column: 'financial_status', type: "TEXT DEFAULT 'pending'" },
    { table: 'orders', column: 'fulfillment_status', type: "TEXT DEFAULT 'unfulfilled'" },
    { table: 'orders', column: 'total_price', type: "REAL DEFAULT 0" },
  ];

  migrations.forEach(m => {
    try {
      db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type};`);
      console.log(`📦 Migration Applied: ${m.table}.${m.column}`);
    } catch (e) {
      // Ignore "duplicate column" errors
    }
  });

  // ── Status Mappings Table ─────────────────────────────────────────────
  // Admin-configurable table: courier raw status → ERP status
  // Previously hardcoded in tracking.js — now fully manageable from the UI
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courier TEXT NOT NULL DEFAULT 'All',
      courier_status TEXT NOT NULL,
      erp_status TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(courier, courier_status)
    );
  `);

  // Seed from the hardcoded maps that used to live in tracking.js
  const seeds = [
    ['PostEx', 'postex warehouse', 'In Transit'],
    ['PostEx', 'out for return', 'Return Initiated'],
    ['PostEx', 'inroute', 'In Transit'],
    ['PostEx', 'intransit', 'In Transit'],
    ['PostEx', 'delivered', 'Delivered'],
    ['PostEx', 'return received', 'Returned'],
    ['PostEx', 'attempted', 'Attempted'],
    ['PostEx', 'shipper advice', 'Shipper Advice'],
    ['PostEx', 'refused', 'Refused'],
    ['PostEx', 'cancelled', 'Cancelled'],
    ['Instaworld', 'delivered', 'Delivered'],
    ['Instaworld', 'pickup done', 'Booked'],
    ['Instaworld', 'arrival at insta-hub', 'Booked'],
    ['Instaworld', 'handover to courier', 'In Transit'],
    ['Instaworld', 'in transit', 'In Transit'],
    ['Instaworld', 'returned to shipper', 'Returned'],
    ['Instaworld', 'return received at insta hub', 'Returned'],
    ['Instaworld', 'delivery unsuccessful', 'Shipper Advice'],
    ['Instaworld', 'shipper advice', 'Shipper Advice'],
    ['Instaworld', 'uncollected', 'Pending'],
    ['Instaworld', 'out for delivery', 'Out for Delivery'],
    ['Instaworld', 'attempted delivery', 'Attempted'],
    ['all', 'returned to shipper', 'Returned'],
    ['all', 'return received at insta hub', 'Returned'],
    ['all', 'at origin warehouse', 'In Transit'],
    ['all', 'at destination warehouse', 'In Transit'],
    ['all', 'at warehouse', 'In Transit'],
    ['all', 'in transit', 'In Transit'],
    ['all', 'pickup done', 'Booked'],
    ['all', 'arrival at insta-hub', 'Booked'],
    ['all', 'handover to courier', 'In Transit'],
    ['Leopards', 'returned to shipper', 'Returned'],
    ['Leopards', 'delivered', 'Delivered'],
  ];
  const insertMapping = db.prepare(
    `INSERT OR REPLACE INTO status_mappings (courier, courier_status, erp_status) VALUES (?, ?, ?)`
  );
  seeds.forEach(([courier, cs, erp]) => insertMapping.run(courier, cs, erp));

  // Admin user always has ERP status override authority
  try {
    db.exec(`UPDATE users SET can_override_erp_status = 1 WHERE role = 'admin'`);
  } catch (e) { }

  // ── Sync Scheduler Table ─────────────────────────────────────────────
  // Stores per-courier sync intervals; read every minute by the dynamic scheduler
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courier TEXT NOT NULL,
      sync_type TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      UNIQUE(courier, sync_type)
    );
  `);

  // Seed default schedule rows if not already present
  const scheduleSeeds = [
    ['PostEx', 'SMART', 30],
    ['PostEx', 'FULL', 360],
    ['Instaworld', 'SMART', 15],
    ['Instaworld', 'FULL', 360],
  ];
  const insertSchedule = db.prepare(
    `INSERT OR IGNORE INTO sync_schedules (courier, sync_type, interval_minutes) VALUES (?, ?, ?)`
  );
  scheduleSeeds.forEach(([courier, type, mins]) => insertSchedule.run(courier, type, mins));

  // ── Sync History / Notification Hub ──────────────────────────────────
  // Stores per-sync session results for the 🔔 Notification Hub in the Topbar
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      total INTEGER DEFAULT 0,
      success INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      log_data TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT DEFAULT 'live', -- 'live', 'simulation'
      cod_verification_enabled INTEGER DEFAULT 1,
      attempted_delivery_enabled INTEGER DEFAULT 1,
      dispatch_alerts_enabled INTEGER DEFAULT 1,
      min_delay_sec INTEGER DEFAULT 5,
      max_delay_sec INTEGER DEFAULT 15,
      max_per_hour INTEGER DEFAULT 60,
      cooling_period_min INTEGER DEFAULT 15,
      cod_template TEXT DEFAULT '👋 Hello from Trace ERP! We have received your COD order #{ref} for Rs. {amount}. Please reply with CONFIRM to dispatch your order immediately!',
      attempted_template TEXT DEFAULT '⚠️ Urgent: Our rider tried to deliver your parcel ({tracking}) today but couldn''t reach you. Please click here to drop your exact GPS location or delivery instructions so we can reattempt delivery tomorrow: {link}',
      dispatch_template TEXT DEFAULT '📦 Your order #{ref} has been dispatched via {courier}. Tracking number: {tracking}. Track here: {link}',
      ai_responder_enabled INTEGER DEFAULT 1,
      ai_tracking_template TEXT DEFAULT '🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}',
      ai_landmark_template TEXT DEFAULT '🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.',
      status TEXT DEFAULT 'DISCONNECTED',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      order_id INTEGER,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL, -- 'incoming' vs 'outgoing'
      message TEXT NOT NULL,
      message_id TEXT,
      media_url TEXT,
      media_type TEXT,
      status TEXT DEFAULT 'sent',
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_wa_msgs_phone ON whatsapp_messages(phone);
    CREATE INDEX IF NOT EXISTS idx_wa_msgs_order ON whatsapp_messages(order_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msgs_message_id ON whatsapp_messages(message_id);
    CREATE TABLE IF NOT EXISTS gemini_bot_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT DEFAULT '',
      ai_active INTEGER DEFAULT 1,
      model_name TEXT DEFAULT 'gemini-2.5-flash',
      system_prompt TEXT DEFAULT 'You are TRACE AI, the elite customer success and sales concierge for our e-commerce store. You speak fluent Urdu, Roman Urdu, and English. You are helpful, polite, and professional. Use your available tools to check order status, product stock, or create draft orders when requested.',
      strictness TEXT DEFAULT 'balanced',
      auto_learning_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gemini_chat_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      role TEXT NOT NULL, -- 'user' or 'model'
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_gemini_memory_phone ON gemini_chat_memory(phone);

    CREATE TABLE IF NOT EXISTS customer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      preferences TEXT DEFAULT '{}', -- JSON string of extracted traits
      vip_status INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      opted_out INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+5 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );

    CREATE TABLE IF NOT EXISTS gemini_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_date TEXT NOT NULL,
      messages_analyzed INTEGER DEFAULT 0,
      friction_points TEXT DEFAULT '[]', -- JSON array
      prompt_refinements TEXT DEFAULT '[]', -- JSON array
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );

    CREATE TABLE IF NOT EXISTS gemini_knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'policy', 'shipping', 'faq'
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+5 hours'))
    );
  `);

  try { db.exec(`ALTER TABLE whatsapp_settings ADD COLUMN ai_responder_enabled INTEGER DEFAULT 1`); } catch (e) {}
  try { db.exec(`ALTER TABLE whatsapp_settings ADD COLUMN ai_tracking_template TEXT DEFAULT '🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}'`); } catch (e) {}
  try { db.exec(`ALTER TABLE whatsapp_settings ADD COLUMN ai_landmark_template TEXT DEFAULT '🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.'`); } catch (e) {}
  try { db.exec(`ALTER TABLE whatsapp_settings ADD COLUMN status TEXT DEFAULT 'DISCONNECTED'`); } catch (e) {}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN opted_out INTEGER DEFAULT 0`); } catch (e) {}

  // ─── PHASE 1 MIGRATIONS ─────────────────────────────────────────────────────
  // Feature 1: Smart Sizing Memory
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN size_preference TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN is_big_and_tall INTEGER DEFAULT 0`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN size_extracted_at TEXT DEFAULT NULL`); } catch(e){}

  // Feature 2: Ad Attribution
  try { db.exec(`CREATE TABLE IF NOT EXISTS ad_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, platform TEXT NOT NULL, pattern TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now', '+5 hours')))`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN ad_source TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN ad_platform TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN ad_attributed_at TEXT DEFAULT NULL`); } catch(e){}

  // Feature 3: Customer Risk & Return Profiling
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN risk_flag TEXT DEFAULT 'NORMAL'`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN return_rate REAL DEFAULT 0.0`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN risk_updated_at TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN risk_reason TEXT DEFAULT NULL`); } catch(e){}

  // Feature 4B: WhatsApp DP Cache
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN dp_url TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE customer_profiles ADD COLUMN dp_cached_at TEXT DEFAULT NULL`); } catch(e){}

  // ─── PHASE 2 MIGRATIONS ─────────────────────────────────────────────────────
  // Feature 5: COD Pending Verifications
  try { db.exec(`CREATE TABLE IF NOT EXISTS cod_pending_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, phone TEXT NOT NULL, status TEXT DEFAULT 'pending', vn_path TEXT, sent_at TEXT DEFAULT (datetime('now', '+5 hours')), expires_at TEXT, replied_at TEXT)`); } catch(e){}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_cod_pending_phone ON cod_pending_verifications(phone, status)`); } catch(e){}
  try { db.exec(`ALTER TABLE orders ADD COLUMN wa_verification_status TEXT DEFAULT 'pending'`); } catch(e){}

  // Feature 6: Upsell Offers
  try { db.exec(`CREATE TABLE IF NOT EXISTS upsell_offers (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, order_id INTEGER, product_id TEXT, offer_text TEXT, status TEXT DEFAULT 'offered', sent_at TEXT DEFAULT (datetime('now', '+5 hours')), converted_at TEXT)`); } catch(e){}

  // ─── PHASE 3 MIGRATIONS ─────────────────────────────────────────────────────
  // Feature 8: Stuck Parcel Sniper Alerts
  try { db.exec(`CREATE TABLE IF NOT EXISTS sniper_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, phone TEXT NOT NULL, alert_type TEXT NOT NULL, message_sent TEXT, sent_at TEXT DEFAULT (datetime('now', '+5 hours')), delivery_status_at_send TEXT, outcome TEXT DEFAULT 'sent')`); } catch(e){}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sniper_alerts_order ON sniper_alerts(order_id, alert_type, sent_at)`); } catch(e){}
  try { db.exec(`ALTER TABLE whatsapp_settings ADD COLUMN stuck_threshold_hours INTEGER DEFAULT 36`); } catch(e){}

  // Feature 9: Voice Note Transcription
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN transcript TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN transcript_at TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN ai_processed TEXT DEFAULT NULL`); } catch(e){}

  // --- 🔒 FIX: SCHEMA SYNC — Permanently resolves "no such column" crashes ---
  // Idempotent: try/catch swallows "duplicate column" errors on re-run.
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch(e){}
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN intent TEXT DEFAULT NULL`); } catch(e){}
  try { db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN created_at TEXT DEFAULT (datetime('now', '+5 hours'))`); } catch(e){}
  try { db.exec(`ALTER TABLE orders ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch(e){}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_msgs_tenant ON whatsapp_messages(tenant_id)`); } catch(e){}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id)`); } catch(e){}

  // Feature 10: Receipt OCR Payment Scanner
  try { db.exec(`CREATE TABLE IF NOT EXISTS payment_ocr_scans (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, phone TEXT NOT NULL, image_path TEXT, raw_ocr_result TEXT, detected_amount REAL, detected_txn_id TEXT, detected_bank TEXT, confidence REAL DEFAULT 0, status TEXT DEFAULT 'pending', scanned_at TEXT DEFAULT (datetime('now', '+5 hours')))`); } catch(e){}

  const waCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_settings').get().count;
  if (waCount === 0) {
    db.prepare(`
      INSERT INTO whatsapp_settings (mode, cod_verification_enabled, attempted_delivery_enabled, dispatch_alerts_enabled, min_delay_sec, max_delay_sec, max_per_hour, cooling_period_min)
      VALUES ('live', 1, 1, 1, 5, 15, 60, 15)
    `).run();
  }

  const geminiCount = db.prepare('SELECT COUNT(*) as count FROM gemini_bot_settings').get().count;
  if (geminiCount === 0) {
    db.prepare(`
      INSERT INTO gemini_bot_settings (api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled)
      VALUES ('', 1, 'gemini-2.5-flash', 'You are TRACE AI, the elite customer success and sales concierge for our e-commerce store. You speak fluent Urdu, Roman Urdu, and English. You are helpful, polite, and professional. Use your available tools to check order status, product stock, or create draft orders when requested.', 'balanced', 1)
    `).run();
  } else {
    // Migration: Automatically upgrade deprecated gemini-1.5 models to gemini-2.5 equivalents in existing installations
    try {
      db.prepare(`
        UPDATE gemini_bot_settings
        SET model_name = 'gemini-2.5-flash'
        WHERE model_name = 'gemini-1.5-flash'
      `).run();
      db.prepare(`
        UPDATE gemini_bot_settings
        SET model_name = 'gemini-2.5-pro'
        WHERE model_name = 'gemini-1.5-pro'
      `).run();
    } catch (e) {
      console.error('⚠️ Failed to migrate gemini_bot_settings models:', e.message);
    }
  }

  const kbCount = db.prepare('SELECT COUNT(*) as count FROM gemini_knowledge_base').get().count;
  if (kbCount === 0) {
    const kbInsert = db.prepare('INSERT INTO gemini_knowledge_base (category, title, content) VALUES (?, ?, ?)');
    kbInsert.run('policy', 'Return & Exchange Policy', 'We offer a 3-day return and exchange policy. Items must be unused and in original packaging. To exchange a size, customer can request via WhatsApp.');
    kbInsert.run('shipping', 'Courier Delivery Timelines', 'Standard delivery takes 2-4 working days via PostEx or Instaworld. Major cities like Lahore, Karachi, and Islamabad usually receive parcels within 48 hours.');
    kbInsert.run('faq', 'Payment Methods', 'We accept Cash on Delivery (COD), EasyPaisa, JazzCash, Raast, and direct Bank Transfers.');
  }
}
