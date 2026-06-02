const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('🔄 --- EMERGENCY WHATSAPP SESSION RESET --- 🔄');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, '..', 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);
const DB_DIR = path.dirname(DB_PATH);

// 1. Clear DB Session table
if (fs.existsSync(DB_PATH)) {
  console.log(`🔌 Connecting to database: ${DB_PATH}`);
  try {
    const db = new DatabaseSync(DB_PATH);
    
    // Check if table exists
    const checkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wa_session_store'").get();
    if (checkTable) {
      console.log('🧹 Clearing wa_session_store table...');
      const result = db.prepare('DELETE FROM wa_session_store').run();
      console.log(`✅ Cleared ${result.changes} keys from wa_session_store.`);
      
      console.log('🧹 Executing database VACUUM...');
      db.exec('VACUUM;');
      console.log('✅ Database VACUUM completed.');
    } else {
      console.log('ℹ️ Table wa_session_store does not exist in DB.');
    }
  } catch (err) {
    console.error('❌ Failed to clear database session store:', err.message);
  }
} else {
  console.log('⚠️ Database file not found.');
}

// 2. Clear local file-based session directories
const sessionPaths = [
  path.join(DB_DIR, 'wa_session'),
  path.join(DB_DIR, 'sessions')
];

sessionPaths.forEach(dirPath => {
  if (fs.existsSync(dirPath)) {
    console.log(`🧹 Deleting session directory: ${dirPath}`);
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ Successfully deleted directory: ${dirPath}`);
    } catch (err) {
      console.error(`❌ Failed to delete directory ${dirPath}:`, err.message);
    }
  } else {
    console.log(`ℹ️ Directory does not exist: ${dirPath}`);
  }
});

console.log('🏁 WhatsApp Session Reset Complete. A fresh QR code will be generated on startup.');
