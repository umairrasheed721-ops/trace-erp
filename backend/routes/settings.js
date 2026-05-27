const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { db, DB_DIR, DB_PATH } = require('../db');
const botModule = require('../engines/whatsapp_bot');

const getAbsoluteFilePath = (mediaUrl) => {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('/api/media/')) {
    const filename = mediaUrl.split('/').pop();
    const storageDir = process.env.MEDIA_STORAGE_DIR 
      ? path.resolve(process.env.MEDIA_STORAGE_DIR)
      : path.resolve(process.cwd(), 'storage', 'media');
    return path.join(storageDir, filename);
  }
  if (mediaUrl.startsWith('/uploads/')) {
    return path.join(DB_DIR, 'uploads', mediaUrl.substring(9));
  }
  return path.join(DB_DIR, 'uploads', mediaUrl);
};

// GET /api/settings/system-health
router.get('/system-health', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';

    // 1. Total rows in whatsapp_messages for active tenant
    const messagesCountRow = db.prepare("SELECT COUNT(*) as count FROM whatsapp_messages").get();
    const messagesCount = messagesCountRow ? messagesCountRow.count : 0;

    // 2. Physical database size in MB
    const activeDbPath = tenantId === 'default'
      ? DB_PATH
      : path.resolve(path.join(DB_DIR, `trace_erp_${tenantId}.db`));
    
    let dbSizeMb = 0;
    if (fs.existsSync(activeDbPath)) {
      const dbStat = fs.statSync(activeDbPath);
      dbSizeMb = parseFloat((dbStat.size / (1024 * 1024)).toFixed(2));
    }

    // 3. Total disk size in MB of media files for this tenant
    const mediaUrls = db.prepare("SELECT media_url FROM whatsapp_messages WHERE media_url IS NOT NULL").all();
    let mediaBytes = 0;
    const countedPaths = new Set();

    for (const row of mediaUrls) {
      const filePath = getAbsoluteFilePath(row.media_url);
      if (filePath && fs.existsSync(filePath) && !countedPaths.has(filePath)) {
        countedPaths.add(filePath);
        try {
          const fileStat = fs.statSync(filePath);
          mediaBytes += fileStat.size;
        } catch (e) {
          console.warn(`[HEALTH] Failed to stat file: ${filePath}`, e.message);
        }
      }
    }
    const mediaSizeMb = parseFloat((mediaBytes / (1024 * 1024)).toFixed(2));

    return res.json({
      success: true,
      stats: {
        messagesCount,
        dbSizeMb,
        mediaSizeMb
      }
    });
  } catch (error) {
    console.error('[SETTINGS_HEALTH_ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/wipe-chats
router.post('/wipe-chats', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';

    // 1. Retrieve all media URLs first to clean up files
    const mediaUrls = db.prepare("SELECT media_url FROM whatsapp_messages WHERE media_url IS NOT NULL").all();

    // 2. Delete rows (will trigger whatsapp_messages_fts removal automatically via AFTER DELETE trigger)
    db.prepare("DELETE FROM whatsapp_messages WHERE tenant_id = ?").run(tenantId);

    // 3. Delete files on disk
    let deletedFilesCount = 0;
    for (const row of mediaUrls) {
      const filePath = getAbsoluteFilePath(row.media_url);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deletedFilesCount++;
        } catch (e) {
          console.warn(`[WIPE] Failed to unlink file: ${filePath}`, e.message);
        }
      }
    }

    return res.json({
      success: true,
      message: 'Chat history wiped successfully',
      deletedMessagesCount: mediaUrls.length,
      deletedFilesCount
    });
  } catch (error) {
    console.error('[SETTINGS_WIPE_ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/whatsapp-logout
router.post('/whatsapp-logout', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';
    
    // Retrieve bot instance of active tenant
    const botInstance = botModule.getBot(tenantId);
    if (botInstance) {
      console.log(`🔌 [Logout] Logging out WhatsApp session for tenant [${tenantId}]`);
      await botInstance.logoutSession();
    }

    // Delete instance from sessions Map
    botModule.sessions.delete(tenantId);

    return res.json({
      success: true,
      message: 'WhatsApp session logged out successfully'
    });
  } catch (error) {
    console.error('[SETTINGS_LOGOUT_ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
