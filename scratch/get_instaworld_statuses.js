const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const rows = db.prepare(`
    SELECT courier_status, erp_status, is_final, matching_type 
    FROM status_mappings 
    WHERE LOWER(courier) LIKE '%insta%' OR LOWER(courier) = 'all'
    ORDER BY courier, courier_status
  `).all();
  console.log('Instaworld / All Status Mappings in DB:');
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('Error fetching status mappings:', e);
}
