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
      "ALTER TABLE recon_sessions ADD COLUMN sync_to_shopify INTEGER DEFAULT 1"
    ];

    alters.forEach(sql => {
      try {
        db.exec(sql);
      } catch (e) {
        // Ignore column already exists errors
      }
    });
  }
];
