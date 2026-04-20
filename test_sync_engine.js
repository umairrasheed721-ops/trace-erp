const { syncInstaworld } = require('./backend/engines/tracking');
const db = require('./backend/db');

async function testSingle() {
  const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
  // We mock a progress function that logs to console
  const onProgress = (msg, p, t) => console.log(`Progress: ${msg} ${p}/${t}`);
  
  console.log('Starting sync for store 1...');
  // We modify the syncInstaworld to only process one specific order for debugging
  // But since we can't easily modify it without affecting the app, we'll just run it normally
  // and look at the output.
  
  const result = await syncInstaworld(store, 'FULL', onProgress);
  console.log('Result:', result);
}

testSingle();
