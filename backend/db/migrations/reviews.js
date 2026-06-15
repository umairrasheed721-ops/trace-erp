/**
 * db/migrations/reviews.js
 *
 * Product reviews system — stores reviews from Judge.me webhook
 * and manually imported CSVs. Served publicly to Shopify theme.
 */

module.exports = [
  // 1. CREATE product_reviews TABLE
  `CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_handle TEXT NOT NULL,
    product_id TEXT,
    reviewer_name TEXT NOT NULL DEFAULT 'Anonymous',
    reviewer_email TEXT,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    title TEXT,
    body TEXT,
    source TEXT DEFAULT 'judgeme',
    status TEXT NOT NULL DEFAULT 'approved',
    review_date TEXT,
    location TEXT,
    picture_urls TEXT,
    judgeme_id TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 2. INDEXES for fast public API lookups
  `CREATE INDEX IF NOT EXISTS idx_reviews_handle ON product_reviews(product_handle);`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_status ON product_reviews(status);`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_handle_status ON product_reviews(product_handle, status);`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_judgeme_id ON product_reviews(judgeme_id);`,
];
