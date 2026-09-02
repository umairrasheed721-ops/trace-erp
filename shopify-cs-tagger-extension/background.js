/**
 * Trace ERP WhatsApp Web Helper — Background Service Worker
 * Bridges messages from ERP (trace-erp-production.up.railway.app) tab
 * to the active WhatsApp Web tab (web.whatsapp.com).
 *
 * Message protocol:
 *   ERP sends: { type: 'TRACE_OPEN_WA', phone, message, imageUrls, orderId }
 *   Background opens/finds WA Web tab and forwards via chrome.tabs.sendMessage
 */

'use strict';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TRACE_OPEN_WA') {
    handleOpenWA(request, sendResponse);
    return true; // Keep channel open for async response
  }
});

async function handleOpenWA({ phone, message, imageUrls = [], orderId }) {
  try {
    const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    // Check if a WhatsApp Web tab is already open
    const existingTabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

    let waTab;
    if (existingTabs.length > 0) {
      // Reuse existing WA tab — navigate it to new chat
      waTab = existingTabs[0];
      await chrome.tabs.update(waTab.id, { url: waUrl, active: true });
    } else {
      // Open a new WA tab
      waTab = await chrome.tabs.create({ url: waUrl, active: true });
    }

    // Wait for WA tab to load, then inject the payload
    const tabId = waTab.id;
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'TRACE_WA_INJECT',
          phone,
          message,
          imageUrls,
          orderId,
        });
      } catch (err) {
        // Content script may not be ready yet — retry once
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'TRACE_WA_INJECT',
              phone,
              message,
              imageUrls,
              orderId,
            });
          } catch (e) {
            console.warn('[Trace BG] WA inject retry failed:', e.message);
          }
        }, 3000);
      }
    }, 4000); // Give WA Web time to load

  } catch (err) {
    console.error('[Trace BG] handleOpenWA error:', err);
  }
}
