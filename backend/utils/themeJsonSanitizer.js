/**
 * 🛡️ Theme JSON Sanitizer — new-store safe theme upload
 *
 * WHY: Theme JSON files (templates/*.json, sections/*.json, config/settings_data.json)
 * can contain references to files that live in ONE store's Files library, e.g.
 *   "video": "shopify://files/videos/Shirt Video.mp4"
 * On a NEW store that file does not exist, and Shopify rejects the asset with:
 *   "Setting 'video' value does not point to an applicable shopify-hosted video resource."
 * Result: templates/index.json silently fails to import and the homepage returns 404.
 *
 * FIX: blank out store-specific file references before uploading to a store that does not own them.
 * NEVER apply this to a store that already has those files (it would wipe its videos/models).
 */

// Matches store-hosted media that cannot exist on a brand-new store.
const STORE_FILE_REF = /^shopify:\\?\/\\?\/(files\\?\/(videos|models)|shop_videos)/i;

// Shopify error text returned when such a reference is invalid on the target store.
const INVALID_FILE_REF_ERROR = /shopify-hosted|does not point to an applicable/i;

/** Recursively blanks store-specific file refs in a parsed JSON object. Returns number blanked. */
function stripStoreFileRefs(node) {
  let count = 0;
  if (Array.isArray(node)) {
    node.forEach(item => { count += stripStoreFileRefs(item); });
  } else if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (typeof val === 'string' && STORE_FILE_REF.test(val)) {
        node[key] = '';
        count++;
      } else {
        count += stripStoreFileRefs(val);
      }
    }
  }
  return count;
}

/**
 * Sanitizes raw JSON text. Returns { value, count }.
 * If text is not valid JSON, returns it untouched with count 0.
 */
function sanitizeThemeJsonString(raw) {
  try {
    // Shopify JSON assets may start with a /* ... */ auto-generated comment header.
    const header = (raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/) || [''])[0];
    const data = JSON.parse(raw.slice(header.length));
    const count = stripStoreFileRefs(data);
    return { value: count > 0 ? header + JSON.stringify(data, null, 2) : raw, count };
  } catch (_) {
    return { value: raw, count: 0 };
  }
}

/** True when a Shopify asset-upload error is caused by a missing store-hosted file reference. */
function isInvalidFileRefError(errorPayload) {
  try {
    return INVALID_FILE_REF_ERROR.test(typeof errorPayload === 'string' ? errorPayload : JSON.stringify(errorPayload));
  } catch (_) {
    return false;
  }
}

module.exports = { stripStoreFileRefs, sanitizeThemeJsonString, isInvalidFileRefError };
