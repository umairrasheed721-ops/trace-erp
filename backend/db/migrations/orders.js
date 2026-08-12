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
    tracking_history TEXT DEFAULT NULL,
    tags TEXT
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
    allowed_stores TEXT DEFAULT '[]',
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
  `CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_phone_last10 ON orders(SUBSTR(phone, -10));`,
  `CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id);`,

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
      "ALTER TABLE stores ADD COLUMN google_maps_key TEXT",
      "ALTER TABLE orders ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN allowed_stores TEXT DEFAULT '[]'",
      "ALTER TABLE orders ADD COLUMN is_cs_edited INTEGER DEFAULT 0",
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
      "CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)",
      "CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id)"
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
  },

  // 18. Ensure tracking_slug inserts trigger and retroactive healing
  (db) => {
    try {
      console.log('🩹 Running database migration to ensure all orders have tracking_slug and setup INSERT trigger...');
      
      // 1. Create insert trigger for automatic generation on new records
      db.prepare(`
        CREATE TRIGGER IF NOT EXISTS generate_order_tracking_slug
        AFTER INSERT ON orders
        FOR EACH ROW
        WHEN NEW.tracking_slug IS NULL OR NEW.tracking_slug = ''
        BEGIN
          UPDATE orders 
          SET tracking_slug = 'tr_' || LOWER(HEX(RANDOMBLOB(4)))
          WHERE id = NEW.id;
        END;
      `).run();
      
      // 2. Heal existing null/empty slugs
      const result = db.prepare(`
        UPDATE orders 
        SET tracking_slug = 'tr_' || LOWER(HEX(RANDOMBLOB(4))) 
        WHERE tracking_slug IS NULL OR tracking_slug = ''
      `).run();
      
      if (result.changes > 0) {
        console.log(`✅ [Migration] Generated tracking_slug for ${result.changes} existing orders.`);
      }
    } catch (e) {
      console.error('Failed to execute tracking_slug DB migration:', e.message);
    }
  },

  // 19. Auto-heal delivery_status for orders with Return courier statuses
  (db) => {
    try {
      console.log('🩹 Running database migration to update delivery_status for orders with Return courier statuses...');
      const result = db.prepare(`
        UPDATE orders 
        SET delivery_status = 'Return Initiated'
        WHERE LOWER(delivery_status) IN ('in transit', 'in-transit', 'booked', 'attempted')
        AND (
          LOWER(courier_status) LIKE 'return to %' OR
          LOWER(courier_status) LIKE '%return to %' OR
          LOWER(courier_status) LIKE '%return process%' OR
          LOWER(courier_status) LIKE '%return initiated%' OR
          LOWER(courier_status) LIKE '%return in transit%' OR
          LOWER(courier_status) LIKE '%return received at insta hub%'
        )
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration] Auto-healed ${result.changes} orders from 'In Transit' to 'Return Initiated'.`);
      }
    } catch (e) {
      console.error('Failed to auto-heal return status orders in migration:', e.message);
    }
  },

  // 20. Auto-heal legacy instaworld_track_url in stores table
  (db) => {
    try {
      db.prepare(`
        UPDATE stores 
        SET instaworld_track_url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment'
        WHERE instaworld_track_url LIKE '%app.instaworld.pk%' OR instaworld_track_url IS NULL OR instaworld_track_url = ''
      `).run();
      console.log('✅ [Migration] Auto-healed legacy Instaworld tracking URLs in stores table.');
    } catch (e) {
      console.error('Failed to update instaworld_track_url in migration:', e.message);
    }
  },

  // 21. Synchronous Live auto-heal for Instaworld orders with missing courier_status or stuck on Booked
  (db) => {
    try {
      console.log('🩹 [Migration #21] Running live auto-heal for Instaworld orders...');
      // Direct instant fix for Out for Delivery orders
      const outForDeliveryFix = db.prepare(`
        UPDATE orders
        SET delivery_status = 'Out for Delivery'
        WHERE LOWER(courier_status) LIKE '%out for delivery%'
          AND LOWER(delivery_status) != 'out for delivery'
          AND LOWER(delivery_status) NOT IN ('delivered', 'returned', 'cancelled', 'return received')
      `).run();
      if (outForDeliveryFix.changes > 0) {
        console.log(`✅ [Migration #21] Auto-updated ${outForDeliveryFix.changes} orders with 'Out for delivery' courier status to 'Out for Delivery' ERP status.`);
      }
      const orders = db.prepare(`
        SELECT id, tracking_number, courier_status, delivery_status 
        FROM orders 
        WHERE tracking_number IS NOT NULL AND tracking_number != ''
        AND (
          LOWER(delivery_status) IN ('booked', 'pending', 'in transit', 'in-transit')
          OR courier_status IS NULL OR courier_status = '' OR courier_status = '—'
        )
        AND (
          tracking_number LIKE '173%' OR tracking_number LIKE '170%' OR tracking_number LIKE '171%' OR tracking_number LIKE '172%'
          OR LOWER(courier) LIKE '%insta%' OR LOWER(courier) LIKE '%tcs%'
        )
      `).all();

      if (orders.length > 0) {
        console.log(`✅ [Migration #21] Found ${orders.length} candidate orders for Instaworld auto-heal.`);
        const { loadStatusMaps, applyMap } = require('../../engines/tracking/statusMapper');
        const statusMap = loadStatusMaps();
        const apiKey = 'juehwqkpycnowff4spoh';
        const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';

        for (const o of orders) {
          try {
            fetch(trackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tracking_number: o.tracking_number, api_key: apiKey })
            }).then(async res => {
              if (res.ok) {
                const data = await res.json();
                const history = data?.tracking_history || data?.data || (Array.isArray(data) ? data : []);
                if (history.length > 0) {
                  const last = history[history.length - 1];
                  const rawStatus = last.status || last.statusDescription || last.status_description;
                  if (rawStatus) {
                    const erpStatus = applyMap(statusMap, 'TCS', String(rawStatus).toLowerCase()) || 'In Transit';
                    db.prepare('UPDATE orders SET courier_status = ?, delivery_status = ? WHERE id = ?')
                      .run(rawStatus, erpStatus, o.id);
                    console.log(`✅ [Migration #21] Updated Order #${o.id} (${o.tracking_number}): Raw='${rawStatus}', ERP='${erpStatus}'`);
                  }
                }
              }
            }).catch(() => {});
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('Failed to run Migration #21:', e.message);
    }
  },

  // 22. Auto-heal 3-Phase Return Status: Migrate transit returns to 'Return In Transit'
  (db) => {
    try {
      console.log('佳 Running database migration for 3-Phase Return Architecture (Return In Transit)...');
      const result = db.prepare(`
        UPDATE orders 
        SET delivery_status = 'Return In Transit'
        WHERE (
          LOWER(courier_status) LIKE '%return to %' OR
          LOWER(courier_status) LIKE '%arrived at transit hub%' OR
          LOWER(courier_status) LIKE '%departed to %' OR
          LOWER(courier_status) LIKE '%return in transit%' OR
          LOWER(courier_status) LIKE '%out for return%' OR
          LOWER(courier_status) LIKE '%enroute%' OR
          LOWER(courier_status) LIKE '%en route%'
          -- NOTE: '%merchant warehouse%' REMOVED — "Returned at Merchant Warehouse" = return COMPLETE → maps to 'Returned' not 'Return In Transit'
        )
        AND LOWER(delivery_status) NOT IN ('returned', 'return received', 'cancelled')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #22] Auto-healed ${result.changes} return orders to 'Return In Transit'.`);
      }
    } catch (e) {
      console.error('Failed to auto-heal Return In Transit orders:', e.message);
    }
  },

  // 23. Ensure tags column exists on orders table
  (db) => {
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN tags TEXT;`);
      console.log('✅ [Migration #23] Added tags column to orders table.');
    } catch (e) {
      // Column already exists, ignore
    }
  },

  // 24. Auto-heal stuck Pending orders that have tracking numbers or courier statuses (Attempt Made, Shipper Advice, etc.)
  (db) => {
    try {
      // Step A: Extract tracking numbers from notes if tracking_number is empty/null
      db.prepare(`
        UPDATE orders
        SET tracking_number = TRIM(SUBSTR(notes, INSTR(notes, 'Tracking ') + 9, 14))
        WHERE (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
        AND notes LIKE '%Tracking 2%'
      `).run();

      // Step B: Auto-heal delivery_status for orders with attempt made / shipper advice
      const resultAttempt = db.prepare(`
        UPDATE orders 
        SET delivery_status = 'Shipper Advice'
        WHERE (LOWER(delivery_status) = 'pending' OR delivery_status IS NULL)
        AND (
          LOWER(courier_status) LIKE '%attempt%' OR
          LOWER(notes) LIKE '%shipper advice%' OR
          LOWER(notes) LIKE '%reattempt%'
        )
      `).run();

      // Step C: Auto-heal delivery_status for all remaining booked orders with tracking numbers
      const resultBooked = db.prepare(`
        UPDATE orders 
        SET delivery_status = 'Booked'
        WHERE (LOWER(delivery_status) = 'pending' OR delivery_status IS NULL)
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
      `).run();

      if (resultAttempt.changes > 0 || resultBooked.changes > 0) {
        console.log(`✅ [Migration #24] Auto-healed ${resultAttempt.changes} orders to 'Shipper Advice' and ${resultBooked.changes} orders to 'Booked'.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #24:', e.message);
    }
  },

  // 25. Auto-heal Delivery Under Review and Attempt Made orders in DB
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET delivery_status = 'Shipper Advice',
            courier_status = COALESCE(NULLIF(courier_status, ''), 'Delivery Under Review')
        WHERE (
          LOWER(notes) LIKE '%shipper advice%' OR
          LOWER(notes) LIKE '%reattempt%' OR
          LOWER(courier_status) LIKE '%delivery under review%' OR
          LOWER(courier_status) LIKE '%shipper advice%' OR
          LOWER(courier_status) LIKE '%attempt made%'
        )
        AND LOWER(delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #25] Auto-healed ${result.changes} Shipper Advice / Delivery Under Review orders.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #25:', e.message);
    }
  },

  // 26. Auto-heal booked/shipped orders that were mistakenly locked as Cancelled (e.g. TR33368)
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET delivery_status = 'Shipper Advice',
            courier_status = COALESCE(NULLIF(courier_status, ''), 'Delivery Under Review')
        WHERE tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND (
          LOWER(notes) LIKE '%shipper advice%' OR
          LOWER(notes) LIKE '%reattempt%' OR
          LOWER(courier_status) LIKE '%delivery under review%' OR
          LOWER(courier_status) LIKE '%shipper advice%' OR
          LOWER(courier_status) LIKE '%attempt made%' OR
          LOWER(notes) LIKE '%confirm order has been shipped%' OR
          ref_number = 'TR33368' OR
          tracking_number = '27120050025608'
        )
        AND LOWER(delivery_status) = 'cancelled'
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #26] Auto-healed ${result.changes} cancelled orders with active tracking numbers to 'Shipper Advice'.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #26:', e.message);
    }
  },

  // 27. Clean up legacy 2024/2023 courier statuses from Shipper Advice feed
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET courier_status = 'Cancelled (Archived)'
        WHERE (order_date LIKE '2024%' OR order_date LIKE '2023%' OR notes LIKE '%2024-%' OR notes LIKE '%2023-%')
        AND LOWER(COALESCE(courier_status, '')) IN ('delivery under review', 'shipper advice', 'attempt made')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #27] Cleaned ${result.changes} legacy 2024/2023 orders from Shipper Advice feed.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #27:', e.message);
    }
  },

  // 28. Auto-heal orders stuck at wrong ERP status due to 'merchant warehouse' keyword conflict bug.
  //     "Returned at Merchant Warehouse" = return COMPLETE → must be 'Returned', not 'Return Initiated'/'Return In Transit'.
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET delivery_status = 'Returned'
        WHERE LOWER(courier_status) LIKE '%merchant warehouse%'
        AND LOWER(delivery_status) NOT IN ('returned', 'return received', 'cancelled')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #28] Auto-healed ${result.changes} orders stuck at wrong return status — courier_status had 'merchant warehouse' → set to 'Returned'.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #28:', e.message);
    }
  },

  // 29. Auto-heal legacy intermediate statuses (Return Initiated, Return In Transit, Shipper Advice, etc.) to unified 'In Transit'
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET delivery_status = 'In Transit'
        WHERE LOWER(delivery_status) IN ('return initiated', 'return in transit', 'shipper advice', 'out for delivery', 'attempted', 'refused', 'shipped', 'dispatched')
        AND LOWER(delivery_status) NOT IN ('returned', 'return received', 'cancelled', 'delivered')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #29] Simplified ${result.changes} active transit orders to unified 'In Transit' status.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #29:', e.message);
    }
  },

  // 30. Auto-heal orders whose courier_status is 'Returned' or contains 'returned' to 'Returned' ERP status
  (db) => {
    try {
      const result = db.prepare(`
        UPDATE orders
        SET delivery_status = 'Returned'
        WHERE (LOWER(courier_status) LIKE '%returned%' OR LOWER(courier_status) = 'returned' OR LOWER(courier_status) = 'rto')
        AND LOWER(delivery_status) NOT IN ('returned', 'return received', 'cancelled', 'delivered')
      `).run();
      if (result.changes > 0) {
        console.log(`✅ [Migration #30] Auto-healed ${result.changes} orders with courier_status 'Returned' to ERP status 'Returned'.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #30:', e.message);
    }
  },

  // 31. Auto-heal legacy Pending orders that have courier statuses (e.g. Attempted, In Transit) or tracking numbers
  (db) => {
    try {
      // Step A: Move Returned courier statuses to 'Returned'
      db.prepare(`
        UPDATE orders
        SET delivery_status = 'Returned'
        WHERE LOWER(delivery_status) = 'pending'
        AND (LOWER(courier_status) LIKE '%returned%' OR LOWER(courier_status) = 'rto')
      `).run();

      // Step B: Move Delivered courier statuses to 'Delivered'
      db.prepare(`
        UPDATE orders
        SET delivery_status = 'Delivered'
        WHERE LOWER(delivery_status) = 'pending'
        AND LOWER(courier_status) LIKE '%delivered%'
      `).run();

      // Step C: Move all active transit/attempted/booked courier statuses or tracking numbers to 'In Transit'
      const resultTransit = db.prepare(`
        UPDATE orders
        SET delivery_status = 'In Transit'
        WHERE LOWER(delivery_status) = 'pending'
        AND (
          (courier_status IS NOT NULL AND courier_status != '' AND courier_status != '—') OR
          (tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—')
        )
      `).run();

      if (resultTransit.changes > 0) {
        console.log(`✅ [Migration #31] Auto-healed ${resultTransit.changes} legacy Pending orders with courier statuses/tracking numbers to 'In Transit'.`);
      }
    } catch (e) {
      console.error('Failed to run Migration #31:', e.message);
    }
  }
];
