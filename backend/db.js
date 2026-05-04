// Uses Node.js v22+ built-in sqlite (no npm install needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'trace_erp.db');

// Ensure the parent directory exists (important for Railway volume mounts)
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`📁 Created database directory: ${DB_DIR}`);
}

const db = new DatabaseSync(DB_PATH);


function initDb() {
  db.exec(`PRAGMA journal_mode = WAL`);
  db.exec(`PRAGMA foreign_keys = ON`);

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
      UNIQUE(store_id, shopify_order_id)
    );

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

    CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(delivery_status);
    CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status_date);
    
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
  `);


  runMigrations(db);
  
  // Legacy repair logic removed to prevent accidental data loss.
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_master_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      shopify_variant_id TEXT,
      parent_title TEXT NOT NULL,
      variant_title TEXT NOT NULL DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL,
      page_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(role_name, page_id)
    )
  `);

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

  console.log('✅ Database initialized at', DB_PATH);
}

initDb();

// Helper wrappers to mimic better-sqlite3's API pattern
// so the rest of the code doesn't need to change

const _prepare_cache = new Map();

function prepare(sql) {
  // Return an object with .get(), .all(), .run() methods
  return {
    get: (...params) => {
      const start = Date.now();
      const res = db.prepare(sql).get(...params);
      const duration = Date.now() - start;
      if (duration > 500) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql, duration, params } });
      return res;
    },
    all: (...params) => {
      const start = Date.now();
      const res = db.prepare(sql).all(...params);
      const duration = Date.now() - start;
      if (duration > 500) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql, duration, params } });
      return res;
    },
    run: (...params) => {
      const start = Date.now();
      const res = db.prepare(sql).run(...params);
      const duration = Date.now() - start;
      if (duration > 500) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql, duration, params } });
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
      store_id, 
      order_id, 
      user_id, 
      action, 
      typeof details === 'object' ? JSON.stringify(details) : details, 
      typeof snapshot === 'object' ? JSON.stringify(snapshot) : snapshot,
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
    `).run(order_id, user_id, type, oldStr, newStr);
  } catch (err) {
    console.error('❌ Failed to log order change:', err.message);
  }
}

module.exports = { db, prepare, transaction, exec: (sql) => db.exec(sql), logAction, logOrderChange };
try { db.prepare("ALTER TABLE stores ADD COLUMN sync_total INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE stores ADD COLUMN sync_processed INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE audit_logs ADD COLUMN snapshot TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE orders ADD COLUMN cost_locked INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE orders ADD COLUMN courier_fee_locked INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE orders ADD COLUMN packaging_cost REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE product_master_costs ADD COLUMN previous_unit_cost REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE sync_audit ADD COLUMN store_id INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE sync_audit ADD COLUMN level TEXT DEFAULT 'INFO'").run(); } catch(e) {}
try { db.prepare("CREATE INDEX IF NOT EXISTS idx_sync_audit_store ON sync_audit(store_id)").run(); } catch(e) {}
try { db.prepare("CREATE INDEX IF NOT EXISTS idx_sync_audit_level ON sync_audit(level)").run(); } catch(e) {}
try { db.prepare("ALTER TABLE stores ADD COLUMN meta_ad_account_id TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE stores ADD COLUMN meta_access_token TEXT").run(); } catch(e) {}

function runMigrations(db) {
  const migrations = [
    { table: 'orders', column: 'confirmation_token', type: 'TEXT' },
    { table: 'stores', column: 'sync_progress', type: 'TEXT' },
    { table: 'product_master_costs', column: 'variant_title', type: 'TEXT NOT NULL DEFAULT ""' },
    { table: 'product_master_costs', column: 'selling_price', type: 'REAL DEFAULT 0' },
    { table: 'product_master_costs', column: 'shopify_variant_id', type: 'TEXT' }
  ];

  migrations.forEach(m => {
    try {
      db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type};`);
      console.log(`📦 Migration Applied: ${m.table}.${m.column}`);
    } catch (e) {
      // Ignore "duplicate column" errors
    }
  });
}
