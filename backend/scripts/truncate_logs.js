const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('🗑️ --- WHATSAPP MESSAGES LOG TRUNCATION --- 🔍');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, '..', 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);

function getFileSizeMB(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return (stat.size / (1024 * 1024)).toFixed(3);
  } catch (e) {
    return '0.000';
  }
}

if (fs.existsSync(DB_PATH)) {
  const initialSize = getFileSizeMB(DB_PATH);
  console.log(`🔌 Connected to database: ${DB_PATH}`);
  console.log(`📊 Initial DB File Size: ${initialSize} MB`);

  try {
    const db = new DatabaseSync(DB_PATH);
    
    // Check row counts before delete
    let initialCount = 0;
    try {
      const res = db.prepare('SELECT COUNT(*) as count FROM whatsapp_messages').get();
      initialCount = res.count;
      console.log(`💬 WhatsApp messages before truncation: ${initialCount.toLocaleString()} rows`);
    } catch(e) {
      console.log('⚠️ Could not fetch whatsapp_messages count. Maybe table does not exist yet.');
      process.exit(0);
    }

    if (initialCount === 0) {
      console.log('ℹ️ No whatsapp messages to truncate.');
      process.exit(0);
    }

    // Truncate messages older than 15 days
    // Note: created_at format is: YYYY-MM-DD HH:MM:SS (datetime('now', '+5 hours'))
    console.log('Purging logs older than 15 days...');
    const result = db.prepare(`
      DELETE FROM whatsapp_messages 
      WHERE created_at < datetime('now', '+5 hours', '-15 days')
    `).run();
    
    console.log(`✅ Successfully deleted ${result.changes.toLocaleString()} old log rows.`);

    // Check row count after delete
    const finalCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_messages').get().count;
    console.log(`💬 WhatsApp messages after truncation: ${finalCount.toLocaleString()} rows`);

    // Run VACUUM to reclaim space from deleted records
    console.log('🧹 Reclaiming empty space via database VACUUM...');
    const start = Date.now();
    db.exec('VACUUM;');
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ VACUUM completed in ${duration} seconds.`);

    const finalSize = getFileSizeMB(DB_PATH);
    const reclaimed = (parseFloat(initialSize) - parseFloat(finalSize)).toFixed(3);
    console.log(`📊 Final DB File Size: ${finalSize} MB`);
    console.log(`🎉 Space reclaimed: ${reclaimed} MB`);

  } catch (err) {
    console.error('❌ Truncation and vacuum operation failed:', err.message);
  }
} else {
  console.log(`⚠️ Database file not found at: ${DB_PATH}`);
}
