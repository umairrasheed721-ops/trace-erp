const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('🔄 --- DATABASE OPTIMIZATION (VACUUM) --- 🔍');

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
    
    console.log('🧹 Executing VACUUM to reclaim empty space...');
    const start = Date.now();
    db.exec('VACUUM;');
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ VACUUM completed in ${duration} seconds.`);

    const finalSize = getFileSizeMB(DB_PATH);
    const reclaimed = (parseFloat(initialSize) - parseFloat(finalSize)).toFixed(3);
    console.log(`📊 Final DB File Size: ${finalSize} MB`);
    console.log(`🎉 Space reclaimed: ${reclaimed} MB`);

  } catch (err) {
    console.error('❌ Database VACUUM operation failed:', err.message);
  }
} else {
  console.log(`⚠️ Database file not found at: ${DB_PATH}`);
}
