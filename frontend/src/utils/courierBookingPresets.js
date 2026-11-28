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
