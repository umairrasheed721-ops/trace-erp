const db = require('../db');

/**
 * Syncs city list from courier API to local database
 */
async function syncCourierCities(courier, fetchFn, token) {
  try {
    const cities = await fetchFn(token);
    if (!cities || !cities.length) return;

    // Filter out duplicates and nulls, and handle if cities are objects or strings
    const uniqueCities = [...new Set(cities.map(c => {
        const val = typeof c === 'string' ? c : (c.cityName || c.name || c.city || '');
        return val.trim();
    }).filter(Boolean))];

    const insert = db.prepare('INSERT OR IGNORE INTO courier_cities (courier, city_name) VALUES (?, ?)');
    uniqueCities.forEach(city => {
      insert.run(courier, city);
    });

    console.log(`✅ Synced ${uniqueCities.length} cities for ${courier}`);
  } catch (err) {
    console.error(`City Sync Error (${courier}):`, err.message);
  }
}

/**
 * Finds the best match for a city name in the courier's official list
 */
function getBestMatch(inputCity, courier) {
  if (!inputCity) return null;
  const target = inputCity.trim().toLowerCase();
  
  const cities = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ?').all(courier);
  if (!cities.length) return null;

  // 1. Exact match
  const exact = cities.find(c => c.city_name.toLowerCase() === target);
  if (exact) return exact.city_name;

  // 2. Simple contains match
  const contains = cities.find(c => c.city_name.toLowerCase().includes(target) || target.includes(c.city_name.toLowerCase()));
  if (contains) return contains.city_name;

  return null;
}

module.exports = { syncCourierCities, getBestMatch };
