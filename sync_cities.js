const db = require('./backend/db');
const { fetchPostExCities } = require('./backend/engines/postex');
const { fetchInstaworldCities } = require('./backend/engines/instaworld');
const { syncCourierCities } = require('./backend/engines/logistics');

async function run() {
  const stores = db.prepare('SELECT id, postex_token, instaworld_key FROM stores').all();
  for (const store of stores) {
    if (store.postex_token) {
        console.log('Syncing PostEx...');
        await syncCourierCities('PostEx', fetchPostExCities, store.postex_token);
    }
    if (store.instaworld_key) {
        console.log('Syncing Instaworld...');
        await syncCourierCities('Instaworld', fetchInstaworldCities, store.instaworld_key);
    }
  }
  process.exit(0);
}

run();
