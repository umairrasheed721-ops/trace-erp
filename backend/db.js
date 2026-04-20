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
      instaworld_track_url TEXT DEFAULT 'https://app.instaworld.pk/api/track-order',
      last_synced_at TEXT,
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
      delivery_status TEXT DEFAULT 'Pending',
      payment_status TEXT DEFAULT 'Pending',
      postex_weight REAL DEFAULT 0.5,
      courier TEXT,
      cost REAL DEFAULT 0,
      courier_fee REAL DEFAULT 0,
      payment_ref TEXT,
      paid_amount REAL DEFAULT 0,
      payment_date TEXT,
      return_status TEXT,
      hold_reason TEXT,
      status_date TEXT,
      created_timestamp TEXT DEFAULT (datetime('now')),
      order_source TEXT DEFAULT 'Direct / Web',
      UNIQUE(store_id, shopify_order_id)
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      tracking_number TEXT NOT NULL,
      date_added TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, tracking_number)
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
  `);

  // Safe schema migrations (ignore errors if columns already exist)
  try { db.exec("ALTER TABLE daily_metrics ADD COLUMN tiktok_marketing REAL DEFAULT 0;"); } catch(e) {}
  try { db.exec("ALTER TABLE daily_metrics ADD COLUMN diff_correction REAL DEFAULT 0;"); } catch(e) {}

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
      const stmt = db.prepare(sql);
      return stmt.get(...params);
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
    run: (...params) => {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
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

module.exports = { prepare, transaction, exec: (sql) => db.exec(sql) };
