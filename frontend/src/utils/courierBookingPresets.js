/**
 * Shared presets and safe helper utilities for Courier Slip Remarks
 * (PostEx transactionNotes, Instaworld remarks/special_instructions, ERP Packing Slip)
 */

export const COURIER_REMARK_PRESETS = [
  { id: 'call', label: '📞 Call before delivery', shortLabel: '📞 Call', text: 'Call before delivery' },
  { id: 'open', label: '📦 Open parcel allowed', shortLabel: '📦 Open Allow', text: 'Open parcel allowed' },
  { id: 'no_open', label: '🚫 Do not open parcel', shortLabel: '🚫 No Open', text: 'Do not open parcel' },
  { id: 'fragile', label: '⚠️ Fragile — Handle with care', shortLabel: '⚠️ Fragile', text: 'Fragile — Handle with care' },
  { id: 'time', label: '⏰ Deliver before 5 PM', shortLabel: '⏰ <5 PM', text: 'Deliver before 5 PM' },
  { id: 'urgent', label: '⚡ Urgent delivery', shortLabel: '⚡ Urgent', text: 'Urgent delivery' },
];

export function hasRemarkPhrase(currentText, phrase) {
  const parts = String(currentText || '')
    .split(/[;|]/)
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
  return parts.includes(String(phrase || '').trim().toLowerCase());
}

export function toggleRemarkPhrase(currentText, phrase) {
  const target = String(phrase || '').trim();
  if (!target) return String(currentText || '').trim();
  const targetLower = target.toLowerCase();
  const parts = String(currentText || '')
    .split(/[;|]/)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.some(p => p.toLowerCase() === targetLower)) {
    return parts.filter(p => p.toLowerCase() !== targetLower).join('; ');
  }
  return [...parts, target].join('; ');
}

export function appendRemarkPhrase(currentText, phrase) {
  if (hasRemarkPhrase(currentText, phrase)) return String(currentText || '').trim();
  return toggleRemarkPhrase(currentText, phrase);
}

/**
 * Safely detect delivery-slip instructions written in Shopify customer notes
 * (e.g. "confirm open to allow" -> suggests "Open parcel allowed")
 * WITHOUT ever auto-leaking internal CS notes ("confirm on wp", etc.) onto courier slips!
 */
export function detectSafeNoteHints(shopifyNote, currentRemarks = '') {
  const note = String(shopifyNote || '').toLowerCase();
  if (!note) return [];
  const hints = [];

  if (/(open\s*(parcel|to\s*allow|allow|check)|allow\s*open|check\s*before\s*pay)/i.test(note)) {
    if (!hasRemarkPhrase(currentRemarks, 'Open parcel allowed')) {
      hints.push('Open parcel allowed');
    }
  }
  if (/(call\s*before|call\s*kr|call\s*kar|ring\s*before)/i.test(note)) {
    if (!hasRemarkPhrase(currentRemarks, 'Call before delivery')) {
      hints.push('Call before delivery');
    }
  }
  if (/\b(urgent|asap|jaldi|fast\s*deliver)/i.test(note)) {
    if (!hasRemarkPhrase(currentRemarks, 'Urgent delivery')) {
      hints.push('Urgent delivery');
    }
  }
  if (/\b(fragile|glass|careful|break)/i.test(note)) {
    if (!hasRemarkPhrase(currentRemarks, 'Fragile — Handle with care')) {
      hints.push('Fragile — Handle with care');
    }
  }

  return hints;
}

export function formatPickupOptionLabel(loc) {
  if (!loc) return '';
  const code = loc.addressCode ? `[${loc.addressCode}] ` : '';
  const city = loc.cityName ? `${loc.cityName} — ` : '';
  const addr = loc.address || '';
  const contact = loc.contactPersonName ? ` (${loc.contactPersonName})` : '';
  return `${code}${city}${addr}${contact}`.trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

const CITY_STOP_WORDS = new Set(['dist', 'distt', 'district', 'teh', 'tehsil', 'city', 'cantt', 'town', 'punjab', 'sindh', 'kpk', 'balochistan', 'pakistan', 'near', 'po', 'chak']);

/**
 * Ranks closest relevant operational cities for any raw customer city string
 * e.g. "Dina Distt Jhelum" -> ["Dina", "Jhelum", ...]
 * e.g. "Mirwah Gorchani" -> ["Mirpur Khas", "Mirpur", "Mirpur Mathelo", ...]
 */
export function rankRelevantCities(rawInput, allCities = [], limit = 6) {
  const input = String(rawInput || '').trim().toLowerCase();
  if (!input || !Array.isArray(allCities) || allCities.length === 0) return [];

  const tokens = input
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !CITY_STOP_WORDS.has(t));

  const scored = [];
  for (const city of allCities) {
    const cLower = String(city || '').trim().toLowerCase();
    if (!cLower) continue;
    let score = 0;

    // 1. Exact or full prefix/substring
    if (cLower === input) score = 120;
    else if (cLower.startsWith(input)) score = 105;
    else if (input.includes(cLower) && cLower.length >= 3) score = 98;
    else if (cLower.includes(input) && input.length >= 3) score = 90;

    // 2. Word-token exact/prefix/fuzzy match (handles "Dina Distt Jhelum", "Mirwah Gorchani")
    const cityWords = cLower.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (cLower === tok) score = Math.max(score, 100);
      else if (cityWords.some(w => w === tok)) score = Math.max(score, 95);
      else if (cityWords.some(w => w.startsWith(tok) && tok.length >= 3)) score = Math.max(score, 82);
      else if (tok.length >= 4 && cityWords.some(w => w.startsWith(tok.slice(0, 3)))) {
        // Shared 3+ char prefix (e.g. "mirwah" -> "mirpur", "mirpur khas")
        let commonPrefix = 0;
        for (const w of cityWords) {
          let k = 0;
          while (k < tok.length && k < w.length && tok[k] === w[k]) k++;
          if (k > commonPrefix) commonPrefix = k;
        }
        if (commonPrefix >= 3) score = Math.max(score, 52 + commonPrefix * 6);
      }

      // Edit distance on individual words for misspellings (e.g. "Lahor", "Faislabad", "Rawlpindi")
      for (const w of cityWords) {
        if (tok.length >= 3 && Math.abs(w.length - tok.length) <= 3) {
          const dist = levenshtein(tok, w);
          const maxLen = Math.max(tok.length, w.length);
          const ratio = 1 - dist / maxLen;
          if (ratio >= 0.58) {
            score = Math.max(score, Math.round(45 + ratio * 42));
          }
        }
      }
    }

    // 3. Whole-string edit distance fallback
    if (score === 0 && input.length >= 4 && Math.abs(cLower.length - input.length) <= 4) {
      const dist = levenshtein(input, cLower);
      const ratio = 1 - dist / Math.max(input.length, cLower.length);
      if (ratio >= 0.55) score = Math.round(40 + ratio * 38);
    }

    if (score > 0) scored.push({ city, score });
  }

  scored.sort((a, b) => b.score - a.score || a.city.localeCompare(b.city));
  return scored.slice(0, limit).map(s => s.city);
}
