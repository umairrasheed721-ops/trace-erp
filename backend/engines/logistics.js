const db = require('../db');

const CITY_CACHE_TTL_HOURS = 24; // Auto-refresh active courier cities every 24h
const MIN_LIVE_POSTEX_CITIES = 200; // Legacy hardcoded fallback was 117–118; live PostEx has ~897 active cities
const inFlightSyncs = new Map();

function normalizeCourierKey(rawCourier) {
  const raw = String(rawCourier || 'PostEx').trim().toLowerCase();
  if (raw.includes('insta') || ['tcs', 'lcs', 'leopards', 'trax', 'callcourier', 'm&p'].includes(raw)) {
    return 'Instaworld';
  }
  return 'PostEx';
}

function dedupeSortedCities(list) {
  const seen = new Map();
  for (const item of list || []) {
    const val = typeof item === 'string'
      ? item
      : (item?.operationalCityName || item?.cityName || item?.name || item?.city || '');
    const clean = String(val || '').trim().replace(/\s+/g, ' ');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function getCacheMeta(courier) {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as cnt, MAX(created_at) as last_synced_at
      FROM courier_cities
      WHERE courier = ?
    `).get(courier);
    const count = Number(row?.cnt || 0);
    const lastSyncedAt = row?.last_synced_at || null;
    let ageHours = Infinity;
    if (lastSyncedAt) {
      const ts = Date.parse(lastSyncedAt.includes('T') ? lastSyncedAt : `${lastSyncedAt.replace(' ', 'T')}Z`);
      if (Number.isFinite(ts)) {
        ageHours = (Date.now() - ts) / 3600000;
      }
    }
    const isTooSmall = count < MIN_LIVE_POSTEX_CITIES;
    const isStale = count === 0 || isTooSmall || ageHours >= CITY_CACHE_TTL_HOURS;
    return { count, lastSyncedAt, ageHours, isStale };
  } catch (_) {
    return { count: 0, lastSyncedAt: null, ageHours: Infinity, isStale: true };
  }
}

function replaceCourierCitiesAtomic(courier, cities) {
  const uniqueCities = dedupeSortedCities(cities);
  if (uniqueCities.length === 0) return 0;

  const delStmt = db.prepare('DELETE FROM courier_cities WHERE courier = ?');
  const insStmt = db.prepare("INSERT OR IGNORE INTO courier_cities (courier, city_name, created_at) VALUES (?, ?, datetime('now'))");
  const tx = db.transaction((list) => {
    delStmt.run(courier);
    for (const city of list) insStmt.run(courier, city);
  });
  tx(uniqueCities);
  return uniqueCities.length;
}

function resolveStoreCredentials(isInsta, storeId = null) {
  if (storeId) {
    const specific = db.prepare(`
      SELECT id, postex_token, instaworld_key, instaworld_key_backup, instaworld_key_3, gas_proxy_url
      FROM stores WHERE id = ?
    `).get(Number(storeId));
    if (specific) {
      const hasNeeded = isInsta
        ? Boolean(specific.instaworld_key || specific.instaworld_key_backup || specific.instaworld_key_3)
        : Boolean(specific.postex_token && !String(specific.postex_token).includes('****'));
      if (hasNeeded) return specific;
    }
  }
  // Courier operational cities are Pakistan-wide: borrow any configured store's active token if selected store has none
  const colCheck = isInsta
    ? "(COALESCE(instaworld_key, '') != '' OR COALESCE(instaworld_key_backup, '') != '' OR COALESCE(instaworld_key_3, '') != '')"
    : "(COALESCE(postex_token, '') != '' AND postex_token NOT LIKE '%****%')";
  return db.prepare(`
    SELECT id, postex_token, instaworld_key, instaworld_key_backup, instaworld_key_3, gas_proxy_url
    FROM stores WHERE ${colCheck} LIMIT 1
  `).get() || null;
}

function getHistoricalVerifiedCourierCities(isInsta) {
  try {
    const rows = isInsta
      ? db.prepare(`
          SELECT DISTINCT TRIM(city) as city
          FROM orders
          WHERE LOWER(COALESCE(courier, '')) IN ('instaworld', 'tcs', 'leopards', 'lcs', 'trax')
            AND tracking_number IS NOT NULL AND TRIM(tracking_number) NOT IN ('', '—')
            AND LOWER(COALESCE(delivery_status, '')) != 'cancelled'
            AND city IS NOT NULL AND TRIM(city) != ''
        `).all()
      : [];
    return rows.map(r => r.city).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Live sync for a specific courier ('PostEx' or 'Instaworld').
 * - PostEx: Official v2/get-operational-city (~897 active delivery cities). Atomic DB replace. Never caches fallback.
 * - Instaworld: Tries live getCities first; if API returns 404/empty, composes live Pakistan active cities
 *   from live PostEx operational cities + historically booked Instaworld cities from ERP orders.
 */
async function syncCourierCitiesLive(rawCourier, storeId = null) {
  const targetCourier = normalizeCourierKey(rawCourier);
  const lockKey = `${targetCourier}`;
  if (inFlightSyncs.has(lockKey)) {
    return inFlightSyncs.get(lockKey);
  }

  const runPromise = (async () => {
    const { fetchPostExCitiesDetailed } = require('./postex');

    if (targetCourier === 'PostEx') {
      const store = resolveStoreCredentials(false, storeId);
      const res = await fetchPostExCitiesDetailed(store?.postex_token || '');
      if (res.source === 'live' && res.cities.length >= 50) {
        replaceCourierCitiesAtomic('PostEx', res.cities);
        console.log(`✅ [CourierCities] Synced ${res.cities.length} LIVE active PostEx cities.`);
        return {
          courier: 'PostEx',
          cities: res.cities,
          count: res.cities.length,
          source: 'live',
          lastSyncedAt: new Date().toISOString(),
        };
      }
      // Do NOT poison DB cache with fallback; return existing cache if any, else fallback
      const existing = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ? ORDER BY city_name ASC').all('PostEx').map(r => r.city_name);
      const best = existing.length > res.cities.length ? existing : res.cities;
      return {
        courier: 'PostEx',
        cities: best,
        count: best.length,
        source: existing.length >= MIN_LIVE_POSTEX_CITIES ? 'cache' : 'fallback',
        lastSyncedAt: getCacheMeta('PostEx').lastSyncedAt,
      };
    }

    // Instaworld (TCS / LCS / Leopards / Trax via Instaworld)
    const iwStore = resolveStoreCredentials(true, storeId);
    const apiKey = iwStore?.instaworld_key || iwStore?.instaworld_key_backup || iwStore?.instaworld_key_3 || '';
    if (apiKey) {
      try {
        const { fetchInstaworldCities } = require('./instaworld');
        const raw = await fetchInstaworldCities(apiKey, iwStore);
        const liveIw = dedupeSortedCities(Array.isArray(raw) ? raw : []);
        if (liveIw.length >= 50) {
          replaceCourierCitiesAtomic('Instaworld', liveIw);
          console.log(`✅ [CourierCities] Synced ${liveIw.length} LIVE Instaworld cities.`);
          return {
            courier: 'Instaworld',
            cities: liveIw,
            count: liveIw.length,
            source: 'live',
            lastSyncedAt: new Date().toISOString(),
          };
        }
      } catch (iwErr) {
        console.warn('⚠️ [CourierCities] Instaworld getCities unavailable, merging live Pakistan operational pool:', iwErr.message);
      }
    }

    // Compose live Pakistan operational city pool (PostEx 897+ live active cities + verified booked Instaworld cities)
    let baseCities = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ? ORDER BY city_name ASC').all('PostEx').map(r => r.city_name);
    let baseSource = baseCities.length >= MIN_LIVE_POSTEX_CITIES ? 'live-pakistan-pool' : 'fallback';
    if (baseCities.length < MIN_LIVE_POSTEX_CITIES) {
      const pxSync = await syncCourierCitiesLive('PostEx', storeId);
      baseCities = pxSync.cities || [];
      baseSource = pxSync.source === 'live' ? 'live-pakistan-pool' : 'fallback';
    }
    const historicalIw = getHistoricalVerifiedCourierCities(true);
    const merged = dedupeSortedCities([...baseCities, ...historicalIw]);

    if (baseSource === 'live-pakistan-pool' && merged.length >= MIN_LIVE_POSTEX_CITIES) {
      replaceCourierCitiesAtomic('Instaworld', merged);
      console.log(`✅ [CourierCities] Synced ${merged.length} active Instaworld/Pakistan cities (${historicalIw.length} historical verified).`);
    }

    return {
      courier: 'Instaworld',
      cities: merged,
      count: merged.length,
      source: baseSource,
      lastSyncedAt: new Date().toISOString(),
    };
  })().finally(() => {
    inFlightSyncs.delete(lockKey);
  });

  inFlightSyncs.set(lockKey, runPromise);
  return runPromise;
}

/**
 * Returns active cities for a courier; automatically syncs live if cache is missing,
 * stale (> 24h), legacy (< 200 cities), or forceRefresh=true.
 */
async function getCourierCitiesWithAutoSync(rawCourier, { storeId = null, forceRefresh = false } = {}) {
  const targetCourier = normalizeCourierKey(rawCourier);
  const meta = getCacheMeta(targetCourier);

  if (!forceRefresh && !meta.isStale) {
    const cached = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ? ORDER BY city_name ASC').all(targetCourier).map(r => r.city_name);
    return {
      courier: targetCourier,
      cities: cached,
      count: cached.length,
      source: 'cache',
      lastSyncedAt: meta.lastSyncedAt,
    };
  }

  return syncCourierCitiesLive(targetCourier, storeId);
}

/**
 * Syncs ALL couriers (PostEx + Instaworld). Used by daily cron, startup check, and manual Sync API.
 */
async function syncAllCouriersNow({ onlyIfStale = false } = {}) {
  const pxMeta = getCacheMeta('PostEx');
  const iwMeta = getCacheMeta('Instaworld');

  const postex = (onlyIfStale && !pxMeta.isStale)
    ? { courier: 'PostEx', count: pxMeta.count, source: 'cache', skipped: true, lastSyncedAt: pxMeta.lastSyncedAt }
    : await syncCourierCitiesLive('PostEx');

  const instaworld = (onlyIfStale && !iwMeta.isStale)
    ? { courier: 'Instaworld', count: iwMeta.count, source: 'cache', skipped: true, lastSyncedAt: iwMeta.lastSyncedAt }
    : await syncCourierCitiesLive('Instaworld');

  return { postex, instaworld };
}

/**
 * Backwards-compatible legacy helper: Syncs city list from courier API to local database
 */
async function syncCourierCities(courier, fetchFn, token) {
  try {
    const cities = await fetchFn(token);
    if (!cities || !cities.length) return 0;
    const saved = replaceCourierCitiesAtomic(courier, cities);
    console.log(`✅ Synced ${saved} cities for ${courier}`);
    return saved;
  } catch (err) {
    console.error(`City Sync Error (${courier}):`, err.message);
    return 0;
  }
}

/**
 * Finds the best match for a city name in the courier's official active list
 */
function getBestMatch(inputCity, courier) {
  if (!inputCity) return null;
  const target = inputCity.trim().toLowerCase();
  const courierKey = normalizeCourierKey(courier);

  const cities = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ?').all(courierKey);
  if (!cities.length) return null;

  // 1. Exact case-insensitive match
  const exact = cities.find(c => c.city_name.toLowerCase() === target);
  if (exact) return exact.city_name;

  // 2. Clean whole-word / prefix match (avoids accidental short substring collisions)
  const wordBoundary = cities.find(c => {
    const cl = c.city_name.toLowerCase();
    return cl.length >= 4 && (target.startsWith(`${cl} `) || target.endsWith(` ${cl}`) || target.includes(` ${cl} `));
  });
  if (wordBoundary) return wordBoundary.city_name;

  // 3. Fallback safe contains match for longer city names (>= 4 chars)
  const contains = cities.find(c => {
    const cl = c.city_name.toLowerCase();
    return (target.length >= 4 && cl.includes(target)) || (cl.length >= 4 && target.includes(cl));
  });
  if (contains) return contains.city_name;

  return null;
}

module.exports = {
  syncCourierCities,
  syncCourierCitiesLive,
  getCourierCitiesWithAutoSync,
  syncAllCouriersNow,
  getCacheMeta,
  getBestMatch,
};
