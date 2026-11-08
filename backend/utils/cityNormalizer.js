/**
 * Pakistan City Name Normalizer & Aliasing Helper
 * Standardizes common city abbreviations, slang, and typos (e.g., Rwp -> Rawalpindi, Lhr -> Lahore)
 */

const CITY_ALIASES = {
  // Rawalpindi
  'rwp': 'Rawalpindi',
  'r.w.p': 'Rawalpindi',
  'rawal pindi': 'Rawalpindi',
  'rawalpind': 'Rawalpindi',
  'rawapindi': 'Rawalpindi',
  'rawalpindi cantt': 'Rawalpindi',
  'rawalpindi city': 'Rawalpindi',
  'pindi': 'Rawalpindi',

  // Lahore
  'lhr': 'Lahore',
  'l.h.r': 'Lahore',
  'lahor': 'Lahore',
  'lahore cantt': 'Lahore',
  'lahore city': 'Lahore',

  // Islamabad
  'isb': 'Islamabad',
  'i.s.b': 'Islamabad',
  'islambad': 'Islamabad',
  'islamabd': 'Islamabad',
  'islam bad': 'Islamabad',
  'islamabad city': 'Islamabad',
  'islamabad capital territory': 'Islamabad',

  // Karachi
  'khi': 'Karachi',
  'khr': 'Karachi',
  'k.h.i': 'Karachi',
  'karachi city': 'Karachi',
  'karachi cantt': 'Karachi',
  'karachi central': 'Karachi',
  'karachi east': 'Karachi',
  'karachi south': 'Karachi',
  'karachi west': 'Karachi',
  'karachi malir': 'Karachi',
  'karachi korangi': 'Karachi',

  // Faisalabad
  'fsd': 'Faisalabad',
  'f.s.d': 'Faisalabad',
  'faislabad': 'Faisalabad',
  'faisal abad': 'Faisalabad',
  'faislabad city': 'Faisalabad',

  // Peshawar
  'psh': 'Peshawar',
  'pew': 'Peshawar',
  'peshawer': 'Peshawar',
  'peshawar cantt': 'Peshawar',
  'peshawar city': 'Peshawar',

  // Multan
  'mux': 'Multan',
  'multan cantt': 'Multan',
  'multan city': 'Multan',

  // Gujranwala
  'grw': 'Gujranwala',
  'gujranwla': 'Gujranwala',
  'gujranwala cantt': 'Gujranwala',
  'gujranwala city': 'Gujranwala',

  // Sialkot
  'skt': 'Sialkot',
  'sailkot': 'Sialkot',
  'sialkot cantt': 'Sialkot',
  'sialkot city': 'Sialkot',

  // Hyderabad
  'hyd': 'Hyderabad',
  'hyderbad': 'Hyderabad',
  'hyder abad': 'Hyderabad',
  'hyderabad city': 'Hyderabad',

  // Quetta
  'qta': 'Quetta',
  'queta': 'Quetta',
  'quetta cantt': 'Quetta',
  'quetta city': 'Quetta',

  // Abbottabad
  'abtd': 'Abbottabad',
  'atd': 'Abbottabad',
  'abbotabad': 'Abbottabad',
  'abbottabad cantt': 'Abbottabad',

  // Bahawalpur
  'bwp': 'Bahawalpur',
  'bhawalpur': 'Bahawalpur',
  'bahawal pur': 'Bahawalpur',
  'bahawalpur city': 'Bahawalpur',

  // Sargodha
  'sgd': 'Sargodha',
  'sargodha city': 'Sargodha',

  // Sheikhupura
  'skp': 'Sheikhupura',
  'sheikhupura city': 'Sheikhupura',

  // Rahim Yar Khan
  'ryk': 'Rahim Yar Khan',
  'rahimyar khan': 'Rahim Yar Khan',
  'rahim yar khan': 'Rahim Yar Khan',
  'rahim yar khan city': 'Rahim Yar Khan',

  // Gujrat
  'gjt': 'Gujrat',
  'gujrat city': 'Gujrat',

  // Jhelum
  'jlm': 'Jhelum',
  'jehlum': 'Jhelum',
  'jhelum cantt': 'Jhelum',
  'jhelum city': 'Jhelum',

  // Sahiwal
  'swl': 'Sahiwal',
  'sahiwal city': 'Sahiwal',

  // Okara
  'oka': 'Okara',
  'okara cantt': 'Okara',
  'okara city': 'Okara',

  // Mardan
  'mdn': 'Mardan',
  'mardan cantt': 'Mardan',
  'mardan city': 'Mardan',

  // Kasur
  'ksr': 'Kasur',
  'kasur city': 'Kasur',

  // Dera Ghazi Khan
  'dgk': 'Dera Ghazi Khan',
  'dg khan': 'Dera Ghazi Khan',
  'd.g. khan': 'Dera Ghazi Khan',
  'd g khan': 'Dera Ghazi Khan',

  // Dera Ismail Khan
  'dik': 'Dera Ismail Khan',
  'di khan': 'Dera Ismail Khan',
  'd.i. khan': 'Dera Ismail Khan',
  'd i khan': 'Dera Ismail Khan',

  // Wazirabad
  'wzd': 'Wazirabad',

  // Hafizabad
  'hzd': 'Hafizabad',

  // Muzaffarabad
  'mzd': 'Muzaffarabad',
  'muzafarabad': 'Muzaffarabad',

  // Mirpur
  'mpr': 'Mirpur',
  'mirpur ajk': 'Mirpur',
  'mirpur ak': 'Mirpur',
  'mirpur (a.k)': 'Mirpur',

  // Mirpur Khas
  'mpk': 'Mirpur Khas',
  'mirpurkhas': 'Mirpur Khas',

  // Wah Cantt
  'wah': 'Wah Cantt',
  'wah cantt': 'Wah Cantt',

  // Chiniot
  'chn': 'Chiniot',

  // Attock
  'atk': 'Attock',

  // Jhang
  'jhg': 'Jhang',

  // Chakwal
  'ckw': 'Chakwal',

  // Mianwali
  'mwl': 'Mianwali',

  // Burewala
  'bwl': 'Burewala',

  // Vehari
  'vhr': 'Vehari',

  // Mandi Bahauddin
  'mbd': 'Mandi Bahauddin',
  'mandi bahauddin': 'Mandi Bahauddin',
  'mandi baha ud din': 'Mandi Bahauddin',

  // Jacobabad
  'jcd': 'Jacobabad',

  // Sukkur
  'skr': 'Sukkur',

  // Larkana
  'lrk': 'Larkana',

  // Nawabshah
  'nws': 'Nawabshah'
};

/**
 * Normalizes city name in JavaScript
 * @param {string} city - Raw city name
 * @returns {string} - Clean, standardized city name
 */
function normalizeCity(city) {
  if (!city || typeof city !== 'string') return '';
  const cleaned = city.trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
  if (!cleaned) return '';
  
  const lower = cleaned.toLowerCase();
  if (CITY_ALIASES[lower]) {
    return CITY_ALIASES[lower];
  }

  // Check prefix for common cities
  if (lower.startsWith('rawalpindi')) return 'Rawalpindi';
  if (lower.startsWith('lahore')) return 'Lahore';
  if (lower.startsWith('islamabad')) return 'Islamabad';
  if (lower.startsWith('karachi')) return 'Karachi';
  if (lower.startsWith('faisalabad')) return 'Faisalabad';
  if (lower.startsWith('peshawar')) return 'Peshawar';
  if (lower.startsWith('multan')) return 'Multan';
  if (lower.startsWith('gujranwala')) return 'Gujranwala';
  if (lower.startsWith('sialkot')) return 'Sialkot';
  if (lower.startsWith('hyderabad')) return 'Hyderabad';
  if (lower.startsWith('quetta')) return 'Quetta';
  if (lower.startsWith('abbottabad')) return 'Abbottabad';
  if (lower.startsWith('bahawalpur')) return 'Bahawalpur';
  if (lower.startsWith('sargodha')) return 'Sargodha';
  if (lower.startsWith('sheikhupura')) return 'Sheikhupura';
  if (lower.startsWith('rahim yar khan')) return 'Rahim Yar Khan';
  if (lower.startsWith('gujrat')) return 'Gujrat';
  if (lower.startsWith('jhelum')) return 'Jhelum';
  if (lower.startsWith('sahiwal')) return 'Sahiwal';
  if (lower.startsWith('okara')) return 'Okara';
  if (lower.startsWith('mardan')) return 'Mardan';
  if (lower.startsWith('kasur')) return 'Kasur';
  if (lower.startsWith('raiwind')) return 'Raiwind';
  if (lower.startsWith('battagram')) return 'Battagram';
  if (lower.startsWith('khanpur')) return 'Khanpur';

  // Fallback: Title case cleaned string
  return cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generates SQL CASE expression to normalize and merge cities inside SQLite queries
 * Prioritizes dynamic city_mappings table, then falls back to built-in dictionary
 * @param {string} col - Column name (default: 'city')
 * @returns {string} - SQL expression
 */
function getCitySqlCase(col = 'city') {
  return `
    COALESCE(
      (SELECT corrected_name FROM city_mappings WHERE original_input = LOWER(TRIM(${col})) LIMIT 1),
      CASE
        WHEN LOWER(TRIM(${col})) IN ('rwp', 'r.w.p', 'rawal pindi', 'rawalpind', 'rawapindi', 'rawalpindi cantt', 'rawalpindi city', 'pindi') OR LOWER(TRIM(${col})) LIKE 'rawalpindi%' THEN 'Rawalpindi'
        WHEN LOWER(TRIM(${col})) IN ('lhr', 'l.h.r', 'lahor', 'lahore cantt', 'lahore city') OR LOWER(TRIM(${col})) LIKE 'lahore%' THEN 'Lahore'
        WHEN LOWER(TRIM(${col})) IN ('isb', 'i.s.b', 'islambad', 'islamabd', 'islam bad', 'islamabad city', 'islamabad capital territory') OR LOWER(TRIM(${col})) LIKE 'islamabad%' THEN 'Islamabad'
        WHEN LOWER(TRIM(${col})) IN ('khi', 'khr', 'k.h.i', 'karachi city', 'karachi cantt', 'karachi central', 'karachi east', 'karachi south', 'karachi west', 'karachi malir', 'karachi korangi') OR LOWER(TRIM(${col})) LIKE 'karachi%' THEN 'Karachi'
        WHEN LOWER(TRIM(${col})) IN ('fsd', 'f.s.d', 'faislabad', 'faisal abad', 'faislabad city') OR LOWER(TRIM(${col})) LIKE 'faisalabad%' THEN 'Faisalabad'
        WHEN LOWER(TRIM(${col})) IN ('psh', 'pew', 'peshawer', 'peshawar cantt', 'peshawar city') OR LOWER(TRIM(${col})) LIKE 'peshawar%' THEN 'Peshawar'
        WHEN LOWER(TRIM(${col})) IN ('mux', 'multan cantt', 'multan city') OR LOWER(TRIM(${col})) LIKE 'multan%' THEN 'Multan'
        WHEN LOWER(TRIM(${col})) IN ('grw', 'gujranwla', 'gujranwala cantt', 'gujranwala city') OR LOWER(TRIM(${col})) LIKE 'gujranwala%' THEN 'Gujranwala'
        WHEN LOWER(TRIM(${col})) IN ('skt', 'sailkot', 'sialkot cantt', 'sialkot city') OR LOWER(TRIM(${col})) LIKE 'sialkot%' THEN 'Sialkot'
        WHEN LOWER(TRIM(${col})) IN ('hyd', 'hyderbad', 'hyder abad', 'hyderabad city') OR LOWER(TRIM(${col})) LIKE 'hyderabad%' THEN 'Hyderabad'
        WHEN LOWER(TRIM(${col})) IN ('qta', 'queta', 'quetta cantt', 'quetta city') OR LOWER(TRIM(${col})) LIKE 'quetta%' THEN 'Quetta'
        WHEN LOWER(TRIM(${col})) IN ('abtd', 'atd', 'abbotabad', 'abbottabad cantt') OR LOWER(TRIM(${col})) LIKE 'abbottabad%' THEN 'Abbottabad'
        WHEN LOWER(TRIM(${col})) IN ('bwp', 'bhawalpur', 'bahawal pur', 'bahawalpur city') OR LOWER(TRIM(${col})) LIKE 'bahawalpur%' THEN 'Bahawalpur'
        WHEN LOWER(TRIM(${col})) IN ('sgd', 'sargodha city') OR LOWER(TRIM(${col})) LIKE 'sargodha%' THEN 'Sargodha'
        WHEN LOWER(TRIM(${col})) IN ('skp', 'sheikhupura city') OR LOWER(TRIM(${col})) LIKE 'sheikhupura%' THEN 'Sheikhupura'
        WHEN LOWER(TRIM(${col})) IN ('ryk', 'rahimyar khan', 'rahim yar khan', 'rahim yar khan city') OR LOWER(TRIM(${col})) LIKE 'rahim yar khan%' THEN 'Rahim Yar Khan'
        WHEN LOWER(TRIM(${col})) IN ('gjt', 'gujrat city') OR LOWER(TRIM(${col})) LIKE 'gujrat%' THEN 'Gujrat'
        WHEN LOWER(TRIM(${col})) IN ('jlm', 'jehlum', 'jhelum cantt', 'jhelum city') OR LOWER(TRIM(${col})) LIKE 'jhelum%' THEN 'Jhelum'
        WHEN LOWER(TRIM(${col})) IN ('swl', 'sahiwal city') OR LOWER(TRIM(${col})) LIKE 'sahiwal%' THEN 'Sahiwal'
        WHEN LOWER(TRIM(${col})) IN ('oka', 'okara cantt', 'okara city') OR LOWER(TRIM(${col})) LIKE 'okara%' THEN 'Okara'
        WHEN LOWER(TRIM(${col})) IN ('mdn', 'mardan cantt', 'mardan city') OR LOWER(TRIM(${col})) LIKE 'mardan%' THEN 'Mardan'
        WHEN LOWER(TRIM(${col})) IN ('ksr', 'kasur city') OR LOWER(TRIM(${col})) LIKE 'kasur%' THEN 'Kasur'
        WHEN LOWER(TRIM(${col})) IN ('dgk', 'dg khan', 'd.g. khan', 'd g khan') OR LOWER(TRIM(${col})) LIKE 'dera ghazi khan%' THEN 'Dera Ghazi Khan'
        WHEN LOWER(TRIM(${col})) IN ('dik', 'di khan', 'd.i. khan', 'd i khan') OR LOWER(TRIM(${col})) LIKE 'dera ismail khan%' THEN 'Dera Ismail Khan'
        WHEN LOWER(TRIM(${col})) IN ('wzd') OR LOWER(TRIM(${col})) LIKE 'wazirabad%' THEN 'Wazirabad'
        WHEN LOWER(TRIM(${col})) IN ('hzd') OR LOWER(TRIM(${col})) LIKE 'hafizabad%' THEN 'Hafizabad'
        WHEN LOWER(TRIM(${col})) IN ('mzd', 'muzafarabad') OR LOWER(TRIM(${col})) LIKE 'muzaffarabad%' THEN 'Muzaffarabad'
        WHEN LOWER(TRIM(${col})) IN ('mpr', 'mirpur ajk', 'mirpur ak', 'mirpur (a.k)') OR LOWER(TRIM(${col})) LIKE 'mirpur%' THEN 'Mirpur'
        WHEN LOWER(TRIM(${col})) IN ('mpk', 'mirpurkhas') OR LOWER(TRIM(${col})) LIKE 'mirpur khas%' THEN 'Mirpur Khas'
        WHEN LOWER(TRIM(${col})) IN ('wah', 'wah cantt') OR LOWER(TRIM(${col})) LIKE 'wah cantt%' THEN 'Wah Cantt'
        WHEN LOWER(TRIM(${col})) LIKE 'raiwind%' THEN 'Raiwind'
        WHEN LOWER(TRIM(${col})) LIKE 'battagram%' THEN 'Battagram'
        WHEN LOWER(TRIM(${col})) LIKE 'khanpur%' THEN 'Khanpur'
        ELSE TRIM(${col})
      END
    )
  `;
}

module.exports = {
  CITY_ALIASES,
  normalizeCity,
  getCitySqlCase
};
