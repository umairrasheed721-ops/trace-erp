/**
 * db/migrations/finance.js
 *
 * Finance migrations.
 * Exports an array of migrations (SQL strings or functions).
 */

module.exports = [
  // 1. CREATE cpr_settlements TABLE
  `CREATE TABLE IF NOT EXISTS cpr_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    courier TEXT NOT NULL, -- PostEx, Leopards, Instaworld
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
  );`,

  // 2. CREATE recon_sessions TABLE
  `CREATE TABLE IF NOT EXISTS recon_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    filename TEXT,
    row_count INTEGER,
    sync_to_shopify INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 3. CREATE cpr_settlement_orders TABLE
  `CREATE TABLE IF NOT EXISTS cpr_settlement_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpr_id INTEGER NOT NULL REFERENCES cpr_settlements(id) ON DELETE CASCADE,
    order_ref TEXT,
    tracking_number TEXT,
    status TEXT,
    amount_collected REAL DEFAULT 0,
    total_expense REAL DEFAULT 0,
    cpr_reference TEXT,
    settlement_date TEXT
  );`,

  // 4. CREATE sync_journal TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS sync_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    sync_type TEXT NOT NULL,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error_details TEXT,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_journal_store_type ON sync_journal(store_id, sync_type);`,

  // 5. Idempotent Schema Alterations
  (db) => {
    const alters = [
      "ALTER TABLE recon_sessions ADD COLUMN filename TEXT",
      "ALTER TABLE recon_sessions ADD COLUMN row_count INTEGER",
      "ALTER TABLE recon_sessions ADD COLUMN sync_to_shopify INTEGER DEFAULT 1",
      "ALTER TABLE recon_logs ADD COLUMN cpr_reference TEXT"
    ];

    alters.forEach(sql => {
      try {
        db.exec(sql);
      } catch (e) {
        // Ignore column already exists errors
      }
    });
  },

  // 6. CREATE cost_change_log TABLE — tracks every cost change for P&L traceability
  `CREATE TABLE IF NOT EXISTS cost_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    parent_title TEXT NOT NULL,
    variant_title TEXT DEFAULT '',
    shopify_variant_id TEXT,
    old_cost REAL,
    new_cost REAL,
    old_shopify_cost REAL,
    new_shopify_cost REAL,
    changed_by TEXT NOT NULL, -- 'shopify_cron' | 'manual' | 'webhook' | 'bulk_accept' | 'inline_save'
    changed_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_cost_change_log_store ON cost_change_log(store_id, changed_at DESC);`,

  // 7. CREATE manual_expenses TABLE
  `CREATE TABLE IF NOT EXISTS manual_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other',
    amount REAL NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL DEFAULT 'one_time',
    expense_date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'Cash',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_manual_expenses_store_date ON manual_expenses(store_id, expense_date);`,

  // 8. CREATE pnl_daily_snapshots TABLE — tracks daily snapshots of monthly PNL for 24h delta tracking
  `CREATE TABLE IF NOT EXISTS pnl_daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    snapshot_date TEXT NOT NULL,
    month_key TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+5 hours')),
    UNIQUE(store_id, snapshot_date, month_key) ON CONFLICT REPLACE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_pnl_daily_snapshots_store_date ON pnl_daily_snapshots(store_id, snapshot_date);`,

  // 9. CREATE admin_notepads TABLE — Super Admin Quick Notepad per store
  `CREATE TABLE IF NOT EXISTS admin_notepads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now', '+5 hours')),
    UNIQUE(store_id) ON CONFLICT REPLACE
  );`,

  // 10. Add prev_metrics_json to pnl_daily_snapshots for Recent Change comparison
  (db) => {
    try {
      db.exec(`ALTER TABLE pnl_daily_snapshots ADD COLUMN prev_metrics_json TEXT;`);
    } catch (_) {}
  },

  // 11. Extend returns_log for item-level Partial / Exchange Returns tracking
  (db) => {
    const alters = [
      "ALTER TABLE returns_log ADD COLUMN return_type TEXT DEFAULT 'rto_full'",
      "ALTER TABLE returns_log ADD COLUMN returned_items_json TEXT",
      "ALTER TABLE returns_log ADD COLUMN notes TEXT"
    ];
    alters.forEach(sql => {
      try {
        db.exec(sql);
      } catch (_) {}
    });
  },

  // 12. Per-Store Purchase Orders, Inventory Ledger & Unified Financial Ledger
  (db) => {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          phone TEXT DEFAULT '',
          contact_person TEXT DEFAULT '',
          city TEXT DEFAULT '',
          opening_balance REAL DEFAULT 0,
          notes TEXT DEFAULT '',
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now', '+5 hours'))
        );
        CREATE INDEX IF NOT EXISTS idx_suppliers_store ON suppliers(store_id, is_active);

        CREATE TABLE IF NOT EXISTS purchase_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL,
          po_number TEXT NOT NULL,
          supplier_id INTEGER,
          status TEXT DEFAULT 'ordered',
          is_baseline INTEGER DEFAULT 0,
          order_date TEXT NOT NULL,
          received_date TEXT,
          subtotal_cost REAL DEFAULT 0,
          landing_cost REAL DEFAULT 0,
          total_cost REAL DEFAULT 0,
          billed_cost REAL DEFAULT 0,
          paid_amount REAL DEFAULT 0,
          notes TEXT DEFAULT '',
          created_by TEXT DEFAULT 'Admin',
          created_at TEXT DEFAULT (datetime('now', '+5 hours')),
          updated_at TEXT DEFAULT (datetime('now', '+5 hours')),
          UNIQUE(store_id, po_number)
        );
        CREATE INDEX IF NOT EXISTS idx_po_store_status ON purchase_orders(store_id, status, id DESC);
        CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(store_id, supplier_id);

        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          store_id INTEGER NOT NULL,
          product_cost_id INTEGER,
          shopify_variant_id TEXT DEFAULT '',
          sku TEXT DEFAULT '',
          parent_title TEXT NOT NULL,
          variant_title TEXT DEFAULT '',
          ordered_qty INTEGER NOT NULL DEFAULT 0,
          received_qty INTEGER NOT NULL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          landed_unit_cost REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now', '+5 hours'))
        );
        CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

        CREATE TABLE IF NOT EXISTS inventory_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL,
          product_cost_id INTEGER,
          sku TEXT DEFAULT '',
          parent_title TEXT NOT NULL,
          variant_title TEXT DEFAULT '',
          movement_type TEXT NOT NULL,
          qty_delta INTEGER NOT NULL DEFAULT 0,
          unit_cost REAL DEFAULT 0,
          ref_type TEXT DEFAULT '',
          ref_id TEXT DEFAULT '',
          ref_label TEXT DEFAULT '',
          shopify_pushed INTEGER DEFAULT 0,
          shopify_error TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          created_by TEXT DEFAULT 'Admin',
          created_at TEXT DEFAULT (datetime('now', '+5 hours'))
        );
        CREATE INDEX IF NOT EXISTS idx_inv_ledger_store ON inventory_ledger(store_id, id DESC);

        CREATE TABLE IF NOT EXISTS financial_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          account_type TEXT DEFAULT 'bank',
          opening_balance REAL DEFAULT 0,
          is_default INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          notes TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now', '+5 hours'))
        );
        CREATE INDEX IF NOT EXISTS idx_fin_accounts_store ON financial_accounts(store_id, is_active);

        CREATE TABLE IF NOT EXISTS ledger_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL,
          entry_date TEXT NOT NULL,
          entry_type TEXT NOT NULL,
          direction TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          account_id INTEGER,
          supplier_id INTEGER,
          po_id INTEGER,
          ref_type TEXT DEFAULT '',
          ref_id TEXT DEFAULT '',
          ref_label TEXT DEFAULT '',
          description TEXT DEFAULT '',
          is_void INTEGER DEFAULT 0,
          void_reason TEXT DEFAULT '',
          created_by TEXT DEFAULT 'Admin',
          created_at TEXT DEFAULT (datetime('now', '+5 hours'))
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_store_date ON ledger_entries(store_id, entry_date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(store_id, account_id, is_void);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_supplier ON ledger_entries(store_id, supplier_id, is_void);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref ON ledger_entries(store_id, ref_type, ref_id);
      `);
      try { db.exec("ALTER TABLE product_master_costs ADD COLUMN shared_pool_key TEXT DEFAULT ''"); } catch (_) {}
      try { db.exec("ALTER TABLE manual_expenses ADD COLUMN account_id INTEGER"); } catch (_) {}
      console.log('✅ [Finance Migration #12] PO, Inventory Ledger & Financial Ledger tables verified.');
    } catch (e) {
      console.error('❌ [Finance Migration #12] Error:', e.message);
    }
  }
];
