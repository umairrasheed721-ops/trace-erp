/**
 * db/migrations/tracking.js
 *
 * Tracking and logistics migrations.
 * Exports an array of migrations (SQL strings or functions).
 */

module.exports = [
  // 1. CREATE status_mappings TABLE
  `CREATE TABLE IF NOT EXISTS status_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courier TEXT NOT NULL DEFAULT 'All',
    courier_status TEXT NOT NULL,
    erp_status TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(courier, courier_status)
  );`,

  // 2. CREATE sync_schedules TABLE
  `CREATE TABLE IF NOT EXISTS sync_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courier TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL DEFAULT 30,
    is_active INTEGER DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    UNIQUE(courier, sync_type)
  );`,

  // 3. CREATE tracking_reconciliation_logs TABLE
  `CREATE TABLE IF NOT EXISTS tracking_reconciliation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    order_ref TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    last_attempted_at TEXT DEFAULT (datetime('now', '+5 hours')),
    resolved_at TEXT
  );`,

  // 4. Seeds
  (db) => {
    // Seed status mappings
    const seeds = [
      ['PostEx', 'postex warehouse', 'In Transit'],
      ['PostEx', 'out for return', 'Return Initiated'],
      ['PostEx', 'inroute', 'In Transit'],
      ['PostEx', 'intransit', 'In Transit'],
      ['PostEx', 'delivered', 'Delivered'],
      ['PostEx', 'delivered to customer', 'Delivered'],
      ['PostEx', 'returned at merchant', 'Returned'],
      ['PostEx', 'returned to merchant', 'Returned'],
      ['PostEx', 'returned at merchant warehouse', 'Returned'],
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
      ['all', 'delivered to customer', 'Delivered'],
      ['all', 'returned at merchant', 'Returned'],
      ['all', 'returned to merchant', 'Returned'],
      ['all', 'returned at merchant warehouse', 'Returned'],
      ['all', 'returned to shipper', 'Returned'],
      ['all', 'return received at insta hub', 'Returned'],
      ['all', 'return to origin', 'Returned'],
      ['all', 'at origin warehouse', 'In Transit'],
      ['all', 'at destination warehouse', 'In Transit'],
      ['all', 'at warehouse', 'In Transit'],
      ['all', 'in transit', 'In Transit'],
      ['all', 'pickup done', 'Booked'],
      ['all', 'arrival at insta-hub', 'Booked'],
      ['all', 'handover to courier', 'In Transit'],
      ['Leopards', 'returned to shipper', 'Returned'],
      ['Leopards', 'delivered', 'Delivered'],
      ['LCS', 'return to origin', 'Returned']
    ];

    try {
      const insertMapping = db.prepare(
        `INSERT OR REPLACE INTO status_mappings (courier, courier_status, erp_status) VALUES (?, ?, ?)`
      );
      seeds.forEach(([courier, cs, erp]) => insertMapping.run(courier, cs, erp));
    } catch (e) {
      console.error('Failed to seed status mappings:', e.message);
    }

    // Seed default sync schedules
    const scheduleSeeds = [
      ['PostEx', 'SMART', 30],
      ['PostEx', 'FULL', 360],
      ['Instaworld', 'SMART', 15],
      ['Instaworld', 'FULL', 360]
    ];

    try {
      const insertSchedule = db.prepare(
        `INSERT OR IGNORE INTO sync_schedules (courier, sync_type, interval_minutes) VALUES (?, ?, ?)`
      );
      scheduleSeeds.forEach(([courier, type, mins]) => insertSchedule.run(courier, type, mins));
    } catch (e) {
      console.error('Failed to seed sync schedules:', e.message);
    }
  },
  // 5. Add matching_type column to status_mappings
  (db) => {
    try {
      db.exec(`ALTER TABLE status_mappings ADD COLUMN matching_type TEXT DEFAULT 'exact'`);
      console.log('✅ Migration: Added matching_type column to status_mappings');
    } catch (e) {
      if (!e.message.includes('duplicate column name') && !e.message.includes('already exists')) {
        console.warn('Migration warning on status_mappings matching_type column:', e.message);
      }
    }
  }
];
