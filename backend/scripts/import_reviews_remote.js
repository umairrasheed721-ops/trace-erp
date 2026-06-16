const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../../reviews_export.csv');
const csvContent = fs.readFileSync(CSV_PATH, 'utf8');

const url = 'https://trace-erp-production.up.railway.app/api/public/import-csv-temp?secret=TraceReviewsImportSeed';

console.log('🚀 Sending CSV to production server...');
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ csv: csvContent })
})
.then(res => {
  if (!res.ok) {
    return res.text().then(t => { throw new Error(t); });
  }
  return res.json();
})
.then(data => {
  console.log('✅ Remote Import Success:', data);
})
.catch(err => {
  console.error('❌ Remote Import Error:', err.message);
});
