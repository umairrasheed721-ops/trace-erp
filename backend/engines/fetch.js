/**
 * Custom fetch wrapper utilizing native globalThis.fetch with:
 * 1. Default browser headers (User-Agent, Accept) to prevent WAF / Firewall blocks.
 * 2. Automatic retry with exponential backoff & jitter for transient errors (429, 5xx, or network drops).
 */
module.exports = async function customFetch(url, options = {}) {
  const { 
    timeout = 15000, 
    signal, 
    retries = 3, 
    backoff = 1500, 
    ...rest 
  } = options;

  // Setup default headers matching a real browser to bypass generic scraper blocks
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(rest.headers || {})
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let attempt = 0; attempt < retries; attempt++) {
    let finalSignal = signal;
    
    // Create new timeout signal per attempt if timeout is specified
    let timeoutId = null;
    if (timeout && !signal) {
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        try {
          finalSignal = AbortSignal.timeout(timeout);
        } catch (e) {
          // Fallback
        }
      }
      if (!finalSignal) {
        try {
          const controller = new AbortController();
          timeoutId = setTimeout(() => {
            try { controller.abort(); } catch (err) {}
          }, timeout);
          finalSignal = controller.signal;
        } catch (e) {
          // Fallback
        }
      }
    }

    try {
      try {
        const response = await globalThis.fetch(url, {
          ...rest,
          headers,
          signal: finalSignal
        });

        // Handle rate limits (429)
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          let sleepMs = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : backoff * Math.pow(2, attempt);
          // Add random jitter between 200ms and 1000ms to prevent synchronized hits
          sleepMs += Math.floor(Math.random() * 800) + 200;
          
          console.warn(`⚠️ [FetchHelper] Rate limited (429) on ${url}. Retrying in ${sleepMs}ms... (Attempt ${attempt + 1}/${retries})`);
          await sleep(sleepMs);
          continue;
        }

        // Handle transient server errors (500, 502, 503, 504)
        if (response.status >= 500 && attempt < retries - 1) {
          let sleepMs = backoff * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
          console.warn(`⚠️ [FetchHelper] Server error (${response.status}) on ${url}. Retrying in ${sleepMs}ms... (Attempt ${attempt + 1}/${retries})`);
          await sleep(sleepMs);
          continue;
        }

        return response;
      } catch (err) {
        // Retry on network errors / connection drops
        if (attempt < retries - 1) {
          let sleepMs = backoff * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
          console.warn(`⚠️ [FetchHelper] Connection failed (${err.message}) on ${url}. Retrying in ${sleepMs}ms... (Attempt ${attempt + 1}/${retries})`);
          await sleep(sleepMs);
          continue;
        }
        throw err;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
};
