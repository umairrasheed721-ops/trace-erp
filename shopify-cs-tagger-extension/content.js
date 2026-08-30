(function () {
  'use strict';

  const ERP_API_URL = 'https://trace-erp-production.up.railway.app/api/public/extension-tag-order';

  const PRESET_TAGS = [
    { label: '🟢 WhatsApp', tag: 'WhatsApp', color: '#10b981', shortcut: 'Alt+W' },
    { label: '🟣 Funnel', tag: 'WhatsApp-In-Funnel', color: '#a855f7', shortcut: 'Alt+F' },
    { label: '🔵 Prepaid', tag: 'Prepaid', color: '#3b82f6', shortcut: 'Alt+P' },
    { label: '🟡 Claim', tag: 'Claim', color: '#f59e0b', shortcut: 'Alt+C' },
    { label: '🔴 Cancel Req', tag: 'Cancel Request', color: '#ef4444', shortcut: 'Alt+X' },
    { label: '💗 Address Chg', tag: 'Address Change', color: '#ec4899', shortcut: 'Alt+A' },
    { label: '⏸️ Hold', tag: 'Hold', color: '#94a3b8', shortcut: 'Alt+H' },
    { label: '🔄 Exchange', tag: 'Exchange', color: '#06b6d4', shortcut: 'Alt+E' }
  ];

  function extractShopifyOrderId() {
    const url = window.location.href;
    const match = url.match(/\/orders\/(\d+)/);
    return match ? match[1] : null;
  }

  function createNotificationToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `trace-cs-toast trace-cs-toast-${type}`;
    toast.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 99999999 !important;
      padding: 8px 14px !important;
      border-radius: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      font-size: 0.8rem !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45) !important;
      color: #ffffff !important;
      background: ${type === 'success' ? '#065f46' : '#7f1d1d'} !important;
      border: 1px solid ${type === 'success' ? '#10b981' : '#ef4444'} !important;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async function sendTagToErp(shopifyOrderId, tag, action = 'add', buttonEl) {
    if (buttonEl) buttonEl.style.opacity = '0.5';

    try {
      const response = await fetch(ERP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_order_id: shopifyOrderId, tag, action })
      });

      const resData = await response.json();
      if (resData.success) {
        createNotificationToast(`✅ Tag <strong>"${tag}"</strong> applied!`, 'success');
      } else {
        createNotificationToast(`⚠️ Failed: ${resData.error || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error('[TRACE CS Tagger Error]:', err);
      createNotificationToast(`❌ Server Error`, 'error');
    } finally {
      if (buttonEl) buttonEl.style.opacity = '1';
    }
  }

  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.style.cursor = 'grab';

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      handle.style.cursor = 'grabbing';
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      let newTop = element.offsetTop - pos2;
      let newLeft = element.offsetLeft - pos1;

      newTop = Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, newTop));
      newLeft = Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, newLeft));

      element.style.top = newTop + "px";
      element.style.left = newLeft + "px";
      element.style.bottom = 'auto';
      element.style.right = 'auto';

      try {
        localStorage.setItem('trace_cs_widget_pos', JSON.stringify({ top: element.style.top, left: element.style.left }));
      } catch (err) {}
    }

    function closeDragElement() {
      handle.style.cursor = 'grab';
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function injectTaggingWidget() {
    // Purge old widget if present to force update
    const oldBar = document.getElementById('trace-cs-tagger-bar');
    if (oldBar) {
      // Check if it's already updated
      if (oldBar.getAttribute('data-version') === '2.0') return;
      oldBar.remove();
    }

    const orderId = extractShopifyOrderId();
    if (!orderId) return;

    const bar = document.createElement('div');
    bar.id = 'trace-cs-tagger-bar';
    bar.setAttribute('data-version', '2.0');
    bar.className = 'trace-cs-tagger-bar';

    // Bulletproof inline styles
    bar.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      z-index: 9999999 !important;
      background: #0f172a !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-radius: 12px !important;
      padding: 8px 10px !important;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      color: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      width: 220px !important;
      user-select: none !important;
    `;

    // Restore saved position if available
    try {
      const savedPos = JSON.parse(localStorage.getItem('trace_cs_widget_pos'));
      if (savedPos && savedPos.top && savedPos.left) {
        bar.style.top = savedPos.top;
        bar.style.left = savedPos.left;
        bar.style.bottom = 'auto';
        bar.style.right = 'auto';
      }
    } catch (err) {}

    let html = `
      <div id="trace-cs-drag-handle" style="display: flex !important; align-items: center !important; justify-content: space-between !important; border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important; padding-bottom: 5px !important; cursor: grab !important;" title="Click & Drag to move screen position">
        <span style="font-weight: 800 !important; font-size: 11px !important; color: #38bdf8 !important;">⚡ CS TAGGER</span>
        <span style="font-size: 10px !important; color: #94a3b8 !important; font-family: monospace !important; background: rgba(255, 255, 255, 0.1) !important; padding: 1px 4px !important; border-radius: 3px !important;">#${orderId.slice(-6)}</span>
        <button type="button" id="trace-cs-min-btn" style="background: transparent !important; border: none !important; color: #94a3b8 !important; font-size: 14px !important; font-weight: bold !important; cursor: pointer !important; padding: 0 4px !important;" title="Minimize/Expand">—</button>
      </div>
      <div id="trace-cs-body" style="display: block !important;">
        <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 5px !important;">
    `;

    PRESET_TAGS.forEach(item => {
      html += `
        <button type="button" class="trace-tag-btn" data-tag="${item.tag}" style="background: rgba(255,255,255,0.08) !important; color: ${item.color} !important; border: 1px solid ${item.color} !important; border-radius: 6px !important; padding: 5px 3px !important; font-size: 10px !important; font-weight: 700 !important; cursor: pointer !important; text-align: center !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;" title="Shortcut: ${item.shortcut}">
          ${item.label}
        </button>
      `;
    });

    html += `
        </div>
      </div>
    `;
    bar.innerHTML = html;

    document.body.appendChild(bar);

    // Make Draggable
    const dragHandle = bar.querySelector('#trace-cs-drag-handle');
    makeDraggable(bar, dragHandle);

    // Minimize toggle
    const minBtn = bar.querySelector('#trace-cs-min-btn');
    const body = bar.querySelector('#trace-cs-body');
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      minBtn.innerText = isHidden ? '—' : '+';
    });

    // Attach Click Handlers
    bar.querySelectorAll('.trace-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = btn.getAttribute('data-tag');
        sendTagToErp(orderId, tag, 'add', btn);
      });
    });
  }

  // Keyboard Shortcuts Listener
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    const orderId = extractShopifyOrderId();
    if (!orderId) return;

    const key = e.key.toUpperCase();
    let matchedTag = null;

    if (key === 'W') matchedTag = 'WhatsApp';
    else if (key === 'F') matchedTag = 'WhatsApp-In-Funnel';
    else if (key === 'P') matchedTag = 'Prepaid';
    else if (key === 'C') matchedTag = 'Claim';
    else if (key === 'X') matchedTag = 'Cancel Request';
    else if (key === 'A') matchedTag = 'Address Change';
    else if (key === 'H') matchedTag = 'Hold';
    else if (key === 'E') matchedTag = 'Exchange';

    if (matchedTag) {
      e.preventDefault();
      sendTagToErp(orderId, matchedTag, 'add');
    }
  });

  // Observe URL changes & DOM updates
  let lastUrl = location.href;
  setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const existing = document.getElementById('trace-cs-tagger-bar');
      if (existing) existing.remove();
      setTimeout(injectTaggingWidget, 800);
    } else {
      if (extractShopifyOrderId()) {
        injectTaggingWidget();
      }
    }
  }, 1200);

  // Initial Run
  setTimeout(injectTaggingWidget, 800);
})();
