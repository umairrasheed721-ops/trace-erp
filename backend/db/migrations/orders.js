/**
 * db/migrations/orders.js
 *
 * Core / Orders migrations and seeds.
 * Exports an array of migrations (SQL strings or functions).
 */

module.exports = [
  // 1. CREATE stores TABLE
  `CREATE TABLE IF NOT EXISTS stores (
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
    google_maps_key TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 2. CREATE orders TABLE
  `CREATE TABLE IF NOT EXISTS orders (
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
    shipping_fee REAL DEFAULT 0,
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
    wa_verification_status TEXT DEFAULT 'Pending',
    wa_message_id TEXT,
    wa_interaction_logs TEXT DEFAULT '[]',
    address_quality_score INTEGER DEFAULT 100,
    tracking_slug TEXT,
    customer_gps_lat REAL,
    customer_gps_lng REAL,
    customer_dispatch_instructions TEXT,
    rescue_submitted_at TEXT,
    courier_ticket_id TEXT,
    financial_status TEXT DEFAULT 'pending',
    fulfillment_status TEXT DEFAULT 'unfulfilled',
    total_price REAL DEFAULT 0,
    tenant_id TEXT DEFAULT 'default',
    tracking_history TEXT DEFAULT NULL
  );`,

  // 3. CREATE products TABLE
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    shopify_product_id TEXT,
    shopify_variant_id TEXT,
    sku TEXT,
    title TEXT,
    image_url TEXT,
    price REAL,
    inventory_qty INTEGER DEFAULT 0,
    inventory_policy TEXT DEFAULT 'deny',
    product_url TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, shopify_variant_id)
  );`,

  // 4. CREATE blacklist TABLE
  `CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 5. CREATE watchdog_results TABLE
  `CREATE TABLE IF NOT EXISTS watchdog_results (
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
  );`,

  // 6. CREATE users TABLE
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    can_override_erp_status INTEGER DEFAULT 0,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 7. CREATE system_logs TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL DEFAULT 'INFO',
    message TEXT NOT NULL,
    module TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_syslogs_level ON system_logs(level);`,
  `CREATE INDEX IF NOT EXISTS idx_syslogs_created ON system_logs(created_at DESC);`,

  // 8. CREATE product_master_costs TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS product_master_costs (
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
    variant_image_url TEXT DEFAULT NULL,
    status TEXT DEFAULT 'active',
    inventory_policy TEXT DEFAULT 'deny',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, parent_title, variant_title)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_master_variant_id ON product_master_costs(shopify_variant_id);`,

  // 9. CREATE courier_cities TABLE
  `CREATE TABLE IF NOT EXISTS courier_cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courier TEXT,
    city_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(courier, city_name)
  );`,

  // 10. CREATE city_mappings TABLE
  `CREATE TABLE IF NOT EXISTS city_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_input TEXT NOT NULL UNIQUE,
    corrected_name TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 11. CREATE role_permissions TABLE
  `CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL,
    page_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,

  // 12. CREATE order_history TABLE
  `CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER,
    change_type TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 13. CREATE audit_logs TABLE
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER,
    order_id INTEGER,
    user_id INTEGER,
    action TEXT,
    details TEXT,
    snapshot TEXT,
    level TEXT DEFAULT 'INFO',
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 14. CREATE sync_audit TABLE
  `CREATE TABLE IF NOT EXISTS sync_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_number TEXT,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT (datetime('now')),
    store_id INTEGER,
    level TEXT DEFAULT 'INFO'
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_audit_store ON sync_audit(store_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_audit_level ON sync_audit(level);`,

  // 13. INDEXES ON orders
  `CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_phone_last10 ON orders(SUBSTR(phone, -10));`,

  // 14. Idempotent Schema Alterations (Try-catch wrapper)
  (db) => {
    // Auto-fix role_permissions table if it was created with legacy columns
    try {
      const info = db.prepare("PRAGMA table_info(role_permissions)").all();
      const hasLegacyRole = info.some(col => col.name === 'role');
      if (hasLegacyRole) {
        console.log("⚠️ Legacy role_permissions table schema detected. Dropping and recreating table to match backend API schema.");
        db.exec("DROP TABLE role_permissions");
        db.exec(`CREATE TABLE role_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role_name TEXT NOT NULL,
          page_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
      }
    } catch (e) {
      // Ignore if table does not exist
    }

    const alters = [
      "ALTER TABLE stores ADD COLUMN sync_total INTEGER DEFAULT 0",
      "ALTER TABLE stores ADD COLUMN sync_processed INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE audit_logs ADD COLUMN snapshot TEXT",
      "ALTER TABLE orders ADD COLUMN cost_locked INTEGER DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN courier_fee_locked INTEGER DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN packaging_cost REAL DEFAULT 0",
      "ALTER TABLE product_master_costs ADD COLUMN previous_unit_cost REAL DEFAULT 0",
      "ALTER TABLE sync_audit ADD COLUMN store_id INTEGER",
      "ALTER TABLE sync_audit ADD COLUMN level TEXT DEFAULT 'INFO'",
      "ALTER TABLE sync_audit ADD COLUMN tracking_number TEXT",
      "ALTER TABLE stores ADD COLUMN meta_ad_account_id TEXT",
      "ALTER TABLE stores ADD COLUMN meta_access_token TEXT",
      "ALTER TABLE stores ADD COLUMN instaworld_key_3 TEXT",
      "ALTER TABLE stores ADD COLUMN gas_proxy_url TEXT",
      "ALTER TABLE orders ADD COLUMN confirmation_token TEXT",
      "ALTER TABLE orders ADD COLUMN courier_status TEXT DEFAULT NULL",
      "ALTER TABLE orders ADD COLUMN failed_attempts INTEGER DEFAULT 0",
      "ALTER TABLE stores ADD COLUMN sync_progress TEXT",
      "ALTER TABLE product_master_costs ADD COLUMN variant_title TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE product_master_costs ADD COLUMN selling_price REAL DEFAULT 0",
      "ALTER TABLE product_master_costs ADD COLUMN shopify_variant_id TEXT",
      "ALTER TABLE users ADD COLUMN can_override_erp_status INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN can_set_final_status INTEGER DEFAULT 0",
      "ALTER TABLE product_master_costs ADD COLUMN sku TEXT",
      "ALTER TABLE orders ADD COLUMN financial_status TEXT DEFAULT 'pending'",
      "ALTER TABLE orders ADD COLUMN fulfillment_status TEXT DEFAULT 'unfulfilled'",
      "ALTER TABLE orders ADD COLUMN total_price REAL DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN tenant_id TEXT DEFAULT 'default'",
      "ALTER TABLE products ADD COLUMN inventory_qty INTEGER DEFAULT 0",
      "ALTER TABLE products ADD COLUMN product_url TEXT DEFAULT ''",
      "ALTER TABLE product_master_costs ADD COLUMN variant_image_url TEXT DEFAULT NULL",
      "ALTER TABLE orders ADD COLUMN tracking_history TEXT DEFAULT NULL",
      "ALTER TABLE orders ADD COLUMN shipping_fee REAL DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0",
      "ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'active'",
      "ALTER TABLE product_master_costs ADD COLUMN status TEXT DEFAULT 'active'",
      "ALTER TABLE products ADD COLUMN inventory_policy TEXT DEFAULT 'deny'",
      "ALTER TABLE product_master_costs ADD COLUMN inventory_policy TEXT DEFAULT 'deny'",
      "ALTER TABLE stores ADD COLUMN google_maps_key TEXT"
    ];

    alters.forEach(sql => {
      try {
        db.exec(sql);
      } catch (e) {
        // Ignore column already exists errors
      }
    });
  },

  // 15. Seed Admin User
  (db) => {
    try {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      if (userCount === 0) {
        const bcrypt = require('bcryptjs');
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('admin123', salt);
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hash);
        console.log('👤 Created default admin user: admin / admin123');
      }
    } catch (e) {
      console.error('Failed to seed admin user:', e.message);
    }
  },

  // 16. Retroactively heal self-delivery courier names
  (db) => {
    try {
      console.log('🩹 Running database migration to update existing self-delivery orders to "Self Delivery"...');
      
      const orders = db.prepare(`
        SELECT id, tracking_number, courier 
        FROM orders 
        WHERE (courier IS NULL OR courier = '' OR courier = '—' OR courier = 'Unknown')
        AND tracking_number IS NOT NULL 
        AND tracking_number != '' 
        AND tracking_number != '—'
      `).all();

      const selfKeywords = ['hand', 'self', 'rider', 'local', 'office', 'pickup', 'personal'];
      const datePattern = /^(?:\d{1,4})[./-]\d{1,2}[./-](?:\d{1,4})$/;
      let updatedCount = 0;

      const updateStmt = db.prepare("UPDATE orders SET courier = 'Self Delivery' WHERE id = ?");

      for (const order of orders) {
        const tracking = order.tracking_number.trim().toLowerCase();
        const isKeywordMatch = selfKeywords.some(kw => tracking.includes(kw));
        const isDateMatch = datePattern.test(tracking);

        if (isKeywordMatch || isDateMatch) {
          updateStmt.run(order.id);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`✅ [Migration] Updated ${updatedCount} existing self-delivery orders in DB.`);
      }
    } catch (e) {
      console.error('Failed to update self-delivery orders in migration:', e.message);
    }
  },

  // 17. Retroactively heal PostEx courier names
  (db) => {
    try {
      console.log('🩹 Running database migration to update existing PostEx orders with 14-digit numeric tracking starting with 2...');
      
      const orders = db.prepare(`
        SELECT id, tracking_number, courier 
        FROM orders 
        WHERE (courier IS NULL OR courier = '' OR courier = '—' OR courier = 'Unknown')
        AND tracking_number IS NOT NULL 
        AND tracking_number != '' 
        AND tracking_number != '—'
      `).all();

      let updatedCount = 0;
      const updateStmt = db.prepare("UPDATE orders SET courier = 'PostEx' WHERE id = ?");

      for (const order of orders) {
        const tracking = order.tracking_number.trim();
        // Match 14 digits starting with 2
        if (/^2\d{13}$/.test(tracking)) {
          updateStmt.run(order.id);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`✅ [Migration] Updated ${updatedCount} existing PostEx orders in DB.`);
      }
    } catch (e) {
      console.error('Failed to update PostEx orders in migration:', e.message);
    }
  }
];
