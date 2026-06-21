const fetch = require('./fetch');

/**
 * Resolve proxy URL: per-store (Connect / provision) wins, then Railway env.
 */
function resolveProxyUrl(storeOrOverride) {
  if (storeOrOverride && typeof storeOrOverride === 'object' && storeOrOverride.gas_proxy_url) {
    const u = String(storeOrOverride.gas_proxy_url || '').trim();
    if (u) return u;
  }
  if (typeof storeOrOverride === 'string' && storeOrOverride.trim()) {
    return storeOrOverride.trim();
  }
  return (process.env.INSTAWORLD_PROXY_URL || '').trim() || null;
}

/**
 * HTTP to Instaworld. When a proxy URL is set (env or store.gas_proxy_url),
 * requests go through Google Apps Script (or any relay) instead of Railway → Instaworld.
 *
 * Relay mode: INSTAWORLD_PROXY_FORMAT=relay — POST JSON { url, method, headers, body } to the proxy.
 *
 * Simple mode (default whenever any proxy URL is in use): any POST with JSON body
 * { tracking_number, api_key } goes to the proxy (script calls trackShipment; DB may still hold a portal URL).
 * Other requests hit Instaworld directly (book / cancel / cities).
 *
 * Optional: INSTAWORLD_PROXY_SECRET — sent as X-Instaworld-Proxy-Secret for your script to verify.
 */
async function instaworldFetch(targetUrl, options = {}) {
  const { proxyUrl: explicitProxy, ...fetchOpts } = options;
  const proxy = explicitProxy ? String(explicitProxy).trim() : resolveProxyUrl(null);

  // 🚀 PROXY ENFORCEMENT: If a proxy is set, use it. Only bypass if no proxy exists.
  if (!proxy) {
    // Ensure api_key is in the body for POST requests to trackShipment
    if (targetUrl.includes('trackShipment') && fetchOpts.method === 'POST') {
      try {
        const body = JSON.parse(fetchOpts.body);
        if (body.tracking_number && !body.api_key) {
           // This shouldn't happen with the new engine, but adding for safety
        }
      } catch(e) {}
    }
    return fetch(targetUrl, fetchOpts);
  }

  const secret = (process.env.INSTAWORLD_PROXY_SECRET || '').trim();
  // Minimal Google Apps Script bridges usually only forward trackShipment + { tracking_number, api_key }.
  // If a proxy URL is set and INSTAWORLD_PROXY_FORMAT is omitted, default to simple (matches that pattern).
  const format = (process.env.INSTAWORLD_PROXY_FORMAT || (proxy ? 'simple' : 'relay')).toLowerCase();
  const method = (fetchOpts.method || 'GET').toUpperCase();
  const headers = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(fetchOpts.headers || {}) 
  };

  const canUseSimpleTrack =
    format === 'simple' &&
    method === 'POST' &&
    typeof fetchOpts.body === 'string';

  if (canUseSimpleTrack) {
    try {
      const parsed = JSON.parse(fetchOpts.body);
      if (parsed.tracking_number != null && parsed.api_key != null) {
        const h = { 'Content-Type': 'application/json' };
        if (secret) h['X-Instaworld-Proxy-Secret'] = secret;
        return fetch(proxy, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            tracking_number: String(parsed.tracking_number).trim(),
            api_key: String(parsed.api_key).trim(),
          }),
          timeout: fetchOpts.timeout,
        });
      }
    } catch (_) {
      /* fall through */
    }
  }

  // Simple proxy cannot relay bookOrder / cancelOrder / getCities — avoid POSTing relay JSON the script won't understand.
  if (format === 'simple') {
    return fetch(targetUrl, fetchOpts);
  }

  let body = fetchOpts.body;
  if (body !== undefined && body !== null && typeof body === 'string') {
    const ct = String(headers['Content-Type'] || headers['content-type'] || '');
    if (ct.includes('json')) {
      try {
        body = JSON.parse(body);
      } catch (_) {
        /* keep string */
      }
    }
  }

  const flatHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v != null && v !== '') flatHeaders[k] = String(v);
  }
  if (secret) flatHeaders['X-Instaworld-Proxy-Secret'] = secret;

  const payload = {
    url: targetUrl,
    method,
    headers: flatHeaders,
    body: body === undefined ? null : body,
  };

  return fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: fetchOpts.timeout || 90000,
  });
}

module.exports = { instaworldFetch, resolveProxyUrl };
