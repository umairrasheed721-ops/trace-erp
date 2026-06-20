/**
 * Custom fetch wrapper utilizing native globalThis.fetch with compatibility
 * for node-fetch style timeout option.
 */
module.exports = async function customFetch(url, options = {}) {
  const { timeout, signal, ...rest } = options;
  let finalSignal = signal;

  if (timeout && !signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    try {
      finalSignal = AbortSignal.timeout(timeout);
    } catch (e) {
      console.warn('[FetchHelper] Failed to create AbortSignal.timeout:', e.message);
    }
  }

  return globalThis.fetch(url, {
    ...rest,
    signal: finalSignal
  });
};
