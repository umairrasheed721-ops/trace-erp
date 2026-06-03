const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { deleteFromCloudinary } = require('../services/googleDrive');

console.log('🗑️ --- DAILY WHATSAPP MEDIA PURGE CYCLE --- 🔍');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, '..', 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);

async function runPurge() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`⚠️ Database file not found at: ${DB_PATH}. Exiting.`);
    return;
  }

  try {
    const db = new DatabaseSync(DB_PATH);
    
    // Find all media files older than 30 days on Cloudinary
    // Message created_at matches: YYYY-MM-DD HH:MM:SS (datetime('now', '+5 hours'))
    const oldMessages = db.prepare(`
      SELECT id, message_id, drive_file_id, media_url 
      FROM whatsapp_messages 
      WHERE drive_file_id IS NOT NULL 
        AND drive_file_id != '' 
        AND created_at < datetime('now', '+5 hours', '-30 days')
    `).all();

    console.log(`📊 Found ${oldMessages.length} messages with media files older than 30 days.`);

    if (oldMessages.length === 0) {
      console.log('✨ No old media files to purge today.');
      return;
    }

    let deletedCount = 0;
    
    for (const msg of oldMessages) {
      console.log(`🔄 Processing deletion for message ${msg.message_id} (Cloudinary Public ID: ${msg.drive_file_id})...`);
      const success = await deleteFromCloudinary(msg.drive_file_id);
      
      // Update database anyway to prevent repeating failed deletions in loop indefinitely
      db.prepare(`
        UPDATE whatsapp_messages 
        SET media_url = null, 
            media_type = null, 
            drive_file_id = null 
        WHERE id = ?
      `).run(msg.id);
      
      if (success) {
        deletedCount++;
      }
    }

    console.log(`✅ Cloudinary cleanup completed. Successfully deleted ${deletedCount}/${oldMessages.length} files from Cloudinary.`);

    // Run VACUUM to reclaim space
    console.log('🧹 Reclaiming database empty space via VACUUM...');
    const start = Date.now();
    db.exec('VACUUM;');
    console.log(`✅ VACUUM completed in ${((Date.now() - start) / 1000).toFixed(2)} seconds.`);

  } catch (err) {
    console.error('❌ Truncation and vacuum operation failed:', err.message);
  }
}

module.exports = { runPurge };

// Execute purge if run directly
if (require.main === module) {
  runPurge().then(() => {
    console.log('🏁 Purge script complete.');
  });
}
