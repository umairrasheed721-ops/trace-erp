const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

console.log('🔄 [Startup Migration] Starting critical database schema verification...');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, '..', 'trace_erp.db');
const DB_PATH = process.env.DB_PATH || defaultDbPath;
const DB_DIR = path.dirname(DB_PATH);

console.log(`🔌 [Startup Migration] Connecting to SQLite database at: ${DB_PATH}`);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Helper function to check column existence
function getColumns(tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
  } catch (err) {
    return [];
  }
}

// 1. Ensure whatsapp_messages table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    order_id INTEGER,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL,
    message TEXT NOT NULL,
    message_id TEXT,
    media_url TEXT,
    media_type TEXT,
    status TEXT DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );
`);

// 2. ALTER TABLE ADD COLUMN created_at (if missing)
const columns = getColumns('whatsapp_messages');
const hasCreatedAt = columns.some(c => c.name === 'created_at');
if (!hasCreatedAt) {
  console.log('➕ [Startup Migration] Column "created_at" is missing. Executing ALTER TABLE...');
  db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN created_at TEXT DEFAULT (datetime('now', '+5 hours'))`);
  console.log('✅ [Startup Migration] Column "created_at" successfully added.');
} else {
  console.log('✔ [Startup Migration] Column "created_at" already exists on whatsapp_messages.');
}

// Ensure other key columns exist on whatsapp_messages
const otherColumns = [
  { name: 'tenant_id', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN tenant_id TEXT DEFAULT 'default'` },
  { name: 'intent', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN intent TEXT DEFAULT NULL` },
  { name: 'transcript', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN transcript TEXT DEFAULT NULL` },
  { name: 'transcript_at', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN transcript_at TEXT DEFAULT NULL` },
  { name: 'ai_processed', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN ai_processed TEXT DEFAULT NULL` },
  { name: 'media_url', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN media_url TEXT` },
  { name: 'media_type', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN media_type TEXT` },
  { name: 'message_id', stmt: `ALTER TABLE whatsapp_messages ADD COLUMN message_id TEXT` },
];

otherColumns.forEach(col => {
  const exists = columns.some(c => c.name === col.name);
  if (!exists) {
    try {
      db.exec(col.stmt);
      console.log(`➕ [Startup Migration] Column "${col.name}" added successfully.`);
    } catch (e) {
      console.log(`ℹ [Startup Migration] Note: Column "${col.name}" migration: ${e.message}`);
    }
  }
});

// Ensure tenant_id exists on orders
try {
  const orderColumns = getColumns('orders');
  if (orderColumns.length > 0 && !orderColumns.some(c => c.name === 'tenant_id')) {
    db.exec(`ALTER TABLE orders ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
    console.log('➕ [Startup Migration] Column "tenant_id" added to orders table.');
  }
} catch (e) {
  console.log(`ℹ [Startup Migration] orders table migration note: ${e.message}`);
}

// 3. VERIFY SQL: Run PRAGMA table_info and print columns in startup logs
const verifiedColumns = getColumns('whatsapp_messages');
console.log('📊 [SQL_VERIFY] Physical schema for "whatsapp_messages" in SQLite file:');
verifiedColumns.forEach(c => {
  console.log(`  - Column #${c.cid}: ${c.name} (${c.type}) | Default: ${c.dflt_value} | PK: ${c.pk}`);
});

console.log('✔ [Startup Migration] Schema verification completed.');
