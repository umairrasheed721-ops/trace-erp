'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * cleanVolume
 * Safely frees up disk space on the production volume:
 * 1. Empties FFMPEG temp voice notes inside os.tmpdir() matching `*_opus_*.ogg`
 * 2. Empties the `backend/pending_ack/` directory
 * 3. Truncates all `.log` files to 0 bytes (does not delete them)
 * 4. Cleans the npm cache if accessible
 *
 * Safe constraint: Does not modify or delete SQLite database files (.db, .wal, .shm).
 */
function cleanVolume() {
  console.log('🧹 [VolumeCleaner] Starting production volume cleanup protocol...');

  // 1. Clean FFMPEG temp transcodes in os.tmpdir()
  const tempDir = os.tmpdir();
  console.log(`[VolumeCleaner] Scanning temp directory: ${tempDir}`);
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      let count = 0;
      let bytesFreed = 0;
      for (const file of files) {
        // WhatsApp audio voice notes are generated with names like *_opus_*.ogg
        const isOpus = file.includes('_opus_') && file.endsWith('.ogg');
        if (isOpus) {
          const filePath = path.join(tempDir, file);
          try {
            const stats = fs.statSync(filePath);
            bytesFreed += stats.size;
            fs.unlinkSync(filePath);
            count++;
          } catch (e) {
            console.warn(`[VolumeCleaner] Failed to delete temp file ${file}: ${e.message}`);
          }
        }
      }
      console.log(`[VolumeCleaner] Deleted ${count} temp transcode files, freed ${(bytesFreed / 1024 / 1024).toFixed(2)} MB`);
    }
  } catch (err) {
    console.error(`[VolumeCleaner] Error scanning temp directory ${tempDir}:`, err.message);
  }

  // 2. Clean backend/pending_ack/ folder
  const pendingAckDir = path.resolve(__dirname, '..', 'pending_ack');
  console.log(`[VolumeCleaner] Scanning pending_ack directory: ${pendingAckDir}`);
  try {
    if (fs.existsSync(pendingAckDir)) {
      const files = fs.readdirSync(pendingAckDir);
      let count = 0;
      let bytesFreed = 0;
      for (const file of files) {
        const filePath = path.join(pendingAckDir, file);
        try {
          const stats = fs.statSync(filePath);
          bytesFreed += stats.size;
          fs.unlinkSync(filePath);
          count++;
        } catch (e) {
          console.warn(`[VolumeCleaner] Failed to delete pending_ack file ${file}: ${e.message}`);
        }
      }
      console.log(`[VolumeCleaner] Deleted ${count} pending ack files, freed ${(bytesFreed / 1024 / 1024).toFixed(2)} MB`);
    }
  } catch (err) {
    console.error('[VolumeCleaner] Error cleaning pending_ack files:', err.message);
  }

  // 3. Truncate all application .log files to 0 bytes
  console.log('[VolumeCleaner] Scanning for log files to truncate...');
  const appRoot = path.resolve(__dirname, '..', '..');
  
  function truncateLogFiles(dir) {
    let count = 0;
    let bytesFreed = 0;
    
    function walk(currentDir) {
      if (!fs.existsSync(currentDir)) return;
      
      let files;
      try {
        files = fs.readdirSync(currentDir);
      } catch (err) {
        // Suppress errors reading directories with restricted permissions
        return;
      }

      for (const file of files) {
        const fullPath = path.join(currentDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            // Skip system or external dependency folders
            if (
              file === 'node_modules' || 
              file === '.git' || 
              file === '.gemini' || 
              file === 'wa_session' || 
              file === 'backups' || 
              file === 'storage'
            ) {
              continue;
            }
            walk(fullPath);
          } else if (stat.isFile() && file.endsWith('.log')) {
            // CRITICAL SAFEGUARD: Only truncate files ending in .log
            if (stat.size > 0) {
              bytesFreed += stat.size;
              fs.writeFileSync(fullPath, '');
              count++;
              console.log(`[VolumeCleaner] Truncated log file: ${path.relative(appRoot, fullPath)}`);
            }
          }
        } catch (e) {
          // Suppress errors reading files or walking subdirectory
        }
      }
    }
    
    walk(dir);
    return { count, bytesFreed };
  }

  try {
    const { count, bytesFreed } = truncateLogFiles(appRoot);
    console.log(`[VolumeCleaner] Truncated ${count} log files, freed ${(bytesFreed / 1024 / 1024).toFixed(2)} MB`);
  } catch (err) {
    console.error('[VolumeCleaner] Error during log truncation walk:', err.message);
  }

  // 4. Clean npm cache
  console.log('[VolumeCleaner] Cleaning npm cache...');
  try {
    execSync('npm cache clean --force', { stdio: 'ignore' });
    console.log('[VolumeCleaner] npm cache cleaned successfully.');
  } catch (err) {
    console.warn('[VolumeCleaner] Could not clean npm cache (npm not available or cache locked):', err.message);
  }

  console.log('🏁 [VolumeCleaner] Volume cleanup protocol complete.');
}

module.exports = {
  cleanVolume
};
