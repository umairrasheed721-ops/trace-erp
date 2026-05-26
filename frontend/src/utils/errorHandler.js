/**
 * errorHandler.js — Centralized API Error Reporting Utility
 *
 * Provides `handleApiError(error, addToast, context)` which:
 * - Tags each error with a [CONTEXT] tag for structured log filtering
 * - Shows user-friendly toast notifications instead of silent failures
 * - Never surfaces raw stack traces to the user
 *
 * Usage:
 *   import { handleApiError } from '../utils/errorHandler'
 *   catch (err) { handleApiError(err, addToast, 'CHAT_FETCH') }
 */

// ---------------------------------------------------------------------------
// Error Tag Constants — match backend log tags for cross-stack filtering
// ---------------------------------------------------------------------------
export const ERR = {
  CHAT_FETCH:       '[CHAT_FETCH_ERROR]',
  MESSAGE_SEND:     '[MSG_SEND_ERROR]',
  MEDIA_UPLOAD:     '[MEDIA_UPLOAD_ERROR]',
  VOICE_NOTE:       '[VOICE_NOTE_ERROR]',
  QUICK_REPLY:      '[QUICK_REPLY_ERROR]',
  INVOICE:          '[INVOICE_ERROR]',
  CUSTOMER_FETCH:   '[CUSTOMER_FETCH_ERROR]',
  WS_CONNECT:       '[WS_CONNECT_ERROR]',
  SCHEMA_SYNC:      '[SCHEMA_SYNC_ERROR]',
  NORMALIZATION:    '[JID_NORM_ERROR]',
  UNKNOWN:          '[UNKNOWN_ERROR]',
};

// ---------------------------------------------------------------------------
// User-facing messages for known HTTP status codes
// ---------------------------------------------------------------------------
const HTTP_MESSAGES = {
  400: 'Bad request — check your input and try again.',
  401: 'Session expired. Please log in again.',
  403: 'You don\'t have permission to do that.',
  404: 'Resource not found on the server.',
  500: 'Server error — our team has been notified.',
  502: 'Server is temporarily unreachable. Please retry.',
  503: 'Service unavailable. Please wait and retry.',
};

// ---------------------------------------------------------------------------
// Core Handler
// ---------------------------------------------------------------------------

/**
 * handleApiError
 *
 * @param {Error|Response|string} error   — The caught error or failed fetch Response
 * @param {Function}              addToast — addToast from AppContext (message, type, duration)
 * @param {string}                context  — One of the ERR.* keys or a custom tag string
 * @param {Object}                [opts]
 * @param {string}                [opts.fallback] — Override user-facing message
 * @param {boolean}               [opts.silent]   — If true, log only — no toast shown
 */
export function handleApiError(error, addToast, context = ERR.UNKNOWN, opts = {}) {
  const tag = ERR[context] ?? context;

  // ── Determine the user-facing message ──────────────────────────────────
  let userMsg = opts.fallback ?? null;

  if (!userMsg) {
    // HTTP Response object (fetch returned non-2xx)
    if (error instanceof Response || (error && typeof error.status === 'number')) {
      const statusMsg = HTTP_MESSAGES[error.status];
      userMsg = statusMsg ?? `Request failed (HTTP ${error.status}).`;
    }
    // Network / fetch failure
    else if (error instanceof TypeError && error.message?.toLowerCase().includes('fetch')) {
      userMsg = 'Network error — check your connection and retry.';
    }
    // Specific DB schema errors surfaced from API
    else if (typeof error?.message === 'string' && error.message.includes('no such column')) {
      userMsg = 'Database schema mismatch detected. Please contact support.';
      console.error(`${tag} [SCHEMA_SYNC_ERROR] ${error.message}`);
    }
    // JID normalization errors
    else if (typeof error?.message === 'string' && error.message.includes('normalizePhone')) {
      userMsg = 'Phone number could not be normalized. Check the contact format.';
      console.error(`${tag} [JID_NORM_ERROR] ${error.message}`);
    }
    // Generic JS Error
    else if (error instanceof Error) {
      userMsg = 'An unexpected error occurred. Please try again.';
    }
    else {
      userMsg = String(error ?? 'Unknown error');
    }
  }

  // ── Structured console log (visible in dashboard logs) ─────────────────
  console.error(`${tag}`, error);

  // ── Toast notification ──────────────────────────────────────────────────
  if (!opts.silent && typeof addToast === 'function') {
    addToast(`⚠️ ${userMsg}`, 'error', 5000);
  }

  return userMsg;
}

// ---------------------------------------------------------------------------
// Convenience Wrappers
// ---------------------------------------------------------------------------

/** Wrap a fetch call and auto-handle non-2xx responses */
export async function safeFetch(url, options, addToast, context) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      handleApiError(res, addToast, context);
      return null;
    }
    return res;
  } catch (err) {
    handleApiError(err, addToast, context);
    return null;
  }
}

/** Convenience: parse JSON from a fetch response, handling errors */
export async function fetchJson(url, options, addToast, context) {
  const res = await safeFetch(url, options, addToast, context);
  if (!res) return null;
  try {
    return await res.json();
  } catch (err) {
    handleApiError(err, addToast, context ?? ERR.UNKNOWN, {
      fallback: 'Server returned an invalid response.',
    });
    return null;
  }
}
