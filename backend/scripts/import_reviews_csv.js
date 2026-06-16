/**
 * scripts/import_reviews_csv.js
 *
 * One-time script to import Judge.me exported CSV into our product_reviews table.
 * Run: node backend/scripts/import_reviews_csv.js
 *
 * - Only imports rows with a valid product_handle
 * - Sets status = 'approved' for all imported reviews
 * - Skips duplicates by judgeme_id
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// --- Config ---
const CSV_PATH = path.join(__dirname, '../../reviews_export.csv');
const DB_PATH = path.join(__dirname, '../trace_erp.db');

if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ CSV file not found: ${CSV_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ DB file not found: ${DB_PATH}`);
  process.exit(1);
}

// --- Open DB ---
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

// Ensure table exists
db.exec(`CREATE TABLE IF NOT EXISTS product_reviews (
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
)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_handle ON product_reviews(product_handle)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_status ON product_reviews(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_handle_status ON product_reviews(product_handle, status)`);

// --- Parse CSV ---
// Simple CSV parser that handles quoted fields with newlines inside
function parseCSV(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"' && !inQuotes) {
      inQuotes = true;
    } else if (ch === '"' && inQuotes) {
      if (next === '"') {
        // Escaped quote
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuotes) {
      if (ch === '\r') i++; // skip \n after \r
      row.push(field.trim());
      field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // last row
  row.push(field.trim());
  if (row.some(f => f !== '')) rows.push(row);

  return rows;
}

const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
const allRows = parseCSV(csvContent);

if (allRows.length < 2) {
  console.error('❌ CSV is empty or only has headers');
  process.exit(1);
}

// Map headers
const headers = allRows[0].map(h => h.toLowerCase().replace(/"/g, ''));
const dataRows = allRows.slice(1);

function col(row, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) return null;
  return (row[idx] || '').replace(/^"|"$/g, '');
}

// --- Insert Statement ---
const insert = db.prepare(`
  INSERT OR IGNORE INTO product_reviews
    (product_handle, product_id, reviewer_name, reviewer_email, rating, title, body, source, status, review_date, location, picture_urls, judgeme_id)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, 'judgeme', 'approved', ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;
let invalid = 0;

for (const row of dataRows) {
  const handle = col(row, 'product_handle');
  const rating = parseInt(col(row, 'rating'), 10);

  // Skip rows without a valid handle
  if (!handle || handle.length < 2 || handle.includes('@')) {
    invalid++;
    continue;
  }

  // Skip invalid ratings
  if (isNaN(rating) || rating < 1 || rating > 5) {
    invalid++;
    continue;
  }

  const judgemeId = col(row, 'metaobject_handle') || null;
  const reviewerName = col(row, 'reviewer_name') || 'Anonymous';
  const reviewerEmail = col(row, 'reviewer_email') || null;
  const title = col(row, 'title') || null;
  const body = col(row, 'body') || null;
  const reviewDate = col(row, 'review_date') || null;
  const location = col(row, 'location') || null;
  const productId = col(row, 'product_id') || null;
  const pictureUrls = col(row, 'picture_urls') || null;

  try {
    const result = insert.run(
      handle, productId, reviewerName, reviewerEmail,
      rating, title, body,
      reviewDate, location, pictureUrls, judgemeId
    );
    if (result.changes > 0) {
      imported++;
    } else {
      skipped++; // Duplicate
    }
  } catch (err) {
    console.error(`❌ Failed to insert review (${reviewerName} / ${handle}):`, err.message);
    invalid++;
  }
}

console.log('\n✅ Import Complete!');
console.log(`   📥 Imported : ${imported}`);
console.log(`   ⏭️  Skipped  : ${skipped} (duplicates)`);
console.log(`   ⚠️  Invalid  : ${invalid} (bad handle or rating)`);

// Show summary by product
const summary = db.prepare(`
  SELECT product_handle, COUNT(*) as count, ROUND(AVG(rating), 1) as avg_rating
  FROM product_reviews
  WHERE status = 'approved'
  GROUP BY product_handle
  ORDER BY count DESC
  LIMIT 20
`).all();

console.log('\n📊 Top Products by Review Count:');
console.table(summary);

db.close();
