(function () {
  'use strict';

  const ERP_API_URL = 'https://trace-erp-production.up.railway.app/api/public/extension-tag-order';
  const ERP_INFO_URL = 'https://trace-erp-production.up.railway.app/api/public/extension-order-info';
  const ERP_NOTE_URL = 'https://trace-erp-production.up.railway.app/api/public/extension-add-note';

  const PRESET_TAGS = [
    { label: '🟢 WhatsApp', tag: 'WhatsApp', color: '#10b981', shortcut: 'Alt+W' },
    { label: '🟣 Funnel', tag: 'WhatsApp-In-Funnel', color: '#a855f7', shortcut: 'Alt+F' },
    { label: '🔵 Prepaid', tag: 'Prepaid', color: '#3b82f6', shortcut: 'Alt+P' },
    { label: '🟡 Claim', tag: 'Claim', color: '#f59e0b', shortcut: 'Alt+C' },
    { label: '🔴 Cancel Req', tag: 'Cancel Request', color: '#ef4444', shortcut: 'Alt+X' },
    { label: '📋 Ready to Book', tag: 'Ready to Book', color: '#ec4899', shortcut: 'Alt+R' },
    { label: '⏸️ Hold', tag: 'Hold', color: '#94a3b8', shortcut: 'Alt+H' },
    { label: '🔄 Exchange', tag: 'Exchange', color: '#06b6d4', shortcut: 'Alt+E' }
  ];

  const QUICK_NOTES = [
    { label: '📞 Call No Answer', note: 'CS: Called customer, no response.' },
    { label: '📍 Address Verified', note: 'CS: Address verified with customer.' },
    { label: '⏳ Delay Requested', note: 'CS: Customer requested delivery delay.' },
    { label: '🔁 Re-attempt Req', note: 'CS: Re-attempt requested with courier.' }
  ];

  function extractShopifyOrderId() {
    const url = window.location.href;
    const match = url.match(/\/orders\/(\d+)/);
    return match ? match[1] : null;
  }

  function extractShopifyOrderName() {
    try {
      const match = document.title.match(/(TR\d+|#\d+)/i);
      if (match) return match[0].replace('#', '');

      const headers = document.querySelectorAll('h1, h2, [class*="Header-Title"]');
      for (let i = 0; i < headers.length; i++) {
        const txt = (headers[i].textContent || '').trim();
        if (/^TR\d+/i.test(txt) || /^#TR\d+/i.test(txt)) {
          return txt.replace('#', '');
        }
      }
    } catch (e) {}
    return null;
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
        createNotificationToast(`✅ Tag <strong>"${tag}"</strong> applied! Reloading...`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 600);
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

  async function sendNoteToErp(shopifyOrderId, noteText, buttonEl) {
    if (buttonEl) buttonEl.style.opacity = '0.5';

    try {
      const response = await fetch(ERP_NOTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_order_id: shopifyOrderId, note: noteText })
      });

      const resData = await response.json();
      if (resData.success) {
        createNotificationToast(`📝 Note added: <strong>"${noteText}"</strong>! Reloading...`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 600);
      } else {
        createNotificationToast(`⚠️ Note Error: ${resData.error || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error('[TRACE CS Note Error]:', err);
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
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
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

  async function injectTaggingWidget() {
    const oldBar = document.getElementById('trace-cs-tagger-bar');
    if (oldBar) {
      if (oldBar.getAttribute('data-version') === '4.1') return;
      oldBar.remove();
    }

    const orderId = extractShopifyOrderId();
    if (!orderId) return;

    const orderName = extractShopifyOrderName() || `#${orderId.slice(-6)}`;

    const bar = document.createElement('div');
    bar.id = 'trace-cs-tagger-bar';
    bar.setAttribute('data-version', '4.1');
    bar.className = 'trace-cs-tagger-bar';

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
      width: 240px !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: fit-content !important;
      box-sizing: border-box !important;
      user-select: none !important;
    `;

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
      <div id="trace-cs-drag-handle" style="display: flex !important; align-items: center !important; justify-content: space-between !important; border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important; padding-bottom: 5px !important; height: auto !important; cursor: grab !important;" title="Click & Drag to move screen position">
        <span style="font-weight: 800 !important; font-size: 11px !important; color: #38bdf8 !important;">⚡ CS ASSISTANT</span>
        <span id="trace-cs-order-name" style="font-size: 10.5px !important; font-weight: 700 !important; color: #38bdf8 !important; font-family: monospace !important; background: rgba(56, 189, 248, 0.15) !important; border: 1px solid rgba(56, 189, 248, 0.4) !important; padding: 1px 6px !important; border-radius: 4px !important;">${orderName}</span>
        <button type="button" id="trace-cs-min-btn" style="background: transparent !important; border: none !important; color: #94a3b8 !important; font-size: 14px !important; font-weight: bold !important; cursor: pointer !important; padding: 0 4px !important;" title="Minimize/Expand">—</button>
      </div>

      <div id="trace-cs-tracking-banner" style="font-size: 9.5px !important; color: #93c5fd !important; background: rgba(59, 130, 246, 0.12) !important; border: 1px solid rgba(59, 130, 246, 0.3) !important; padding: 4px 6px !important; border-radius: 6px !important; display: flex !important; align-items: center !important; justify-content: space-between !important;">
        <span>🚚 Fetching TRACE ERP Data...</span>
      </div>

      <div id="trace-cs-body" style="display: block !important; height: auto !important; min-height: 0 !important; max-height: fit-content !important;">
        <div style="font-size: 9px !important; font-weight: 700 !important; color: #64748b !important; text-transform: uppercase !important; margin-bottom: 3px !important;">Tag Buttons:</div>
        <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 4px !important; height: auto !important; margin-bottom: 6px !important;">
    `;

    PRESET_TAGS.forEach(item => {
      html += `
        <button type="button" class="trace-tag-btn" data-tag="${item.tag}" style="background: rgba(255,255,255,0.08) !important; color: ${item.color} !important; border: 1px solid ${item.color} !important; border-radius: 6px !important; padding: 4px 2px !important; font-size: 9.5px !important; font-weight: 700 !important; cursor: pointer !important; text-align: center !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;" title="Shortcut: ${item.shortcut}">
          ${item.label}
        </button>
      `;
    });

    html += `
        </div>

        <div style="font-size: 9px !important; font-weight: 700 !important; color: #64748b !important; text-transform: uppercase !important; margin-bottom: 3px !important;">Quick Notes:</div>
        <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 4px !important; height: auto !important; margin-bottom: 6px !important;">
    `;

    QUICK_NOTES.forEach(qn => {
      html += `
        <button type="button" class="trace-note-btn" data-note="${qn.note}" style="background: rgba(255,255,255,0.05) !important; color: #cbd5e1 !important; border: 1px solid #475569 !important; border-radius: 6px !important; padding: 3px 2px !important; font-size: 9px !important; font-weight: 600 !important; cursor: pointer !important; text-align: center !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;">
          ${qn.label}
        </button>
      `;
    });

    html += `
        </div>

        <div id="trace-cs-wa-container" style="display: none !important; margin-top: 4px !important;">
          <a id="trace-cs-wa-btn" href="#" target="_blank" style="display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; background: #059669 !important; color: #ffffff !important; text-decoration: none !important; border-radius: 6px !important; padding: 6px !important; font-size: 10.5px !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;">
            💬 Open WhatsApp Chat
          </a>
        </div>
      </div>
    `;
    bar.innerHTML = html;

    document.body.appendChild(bar);

    // Make Draggable
    const dragHandle = bar.querySelector('#trace-cs-drag-handle');
    if (dragHandle) makeDraggable(bar, dragHandle);

    // Minimize toggle
    const minBtn = bar.querySelector('#trace-cs-min-btn');
    const body = bar.querySelector('#trace-cs-body');
    if (minBtn && body) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        minBtn.innerText = isHidden ? '—' : '+';
      });
    }

    // Tag Click Handlers
    bar.querySelectorAll('.trace-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = btn.getAttribute('data-tag');
        sendTagToErp(orderId, tag, 'add', btn);
      });
    });

    // Note Click Handlers
    bar.querySelectorAll('.trace-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const noteText = btn.getAttribute('data-note');
        sendNoteToErp(orderId, noteText, btn);
      });
    });

    // Safe Fetch ERP Order Details
    try {
      const orderSearchKey = extractShopifyOrderName() || orderId;
      const infoRes = await fetch(`${ERP_INFO_URL}?shopify_order_id=${encodeURIComponent(orderSearchKey)}`);
      const infoData = await infoRes.json();

      const liveBar = document.getElementById('trace-cs-tagger-bar');
      if (!liveBar) return;

      const banner = liveBar.querySelector('#trace-cs-tracking-banner');
      const orderNameSpan = liveBar.querySelector('#trace-cs-order-name');
      const waContainer = liveBar.querySelector('#trace-cs-wa-container');
      const waBtn = liveBar.querySelector('#trace-cs-wa-btn');

      if (infoData && infoData.success && infoData.order) {
        const ord = infoData.order;
        if (orderNameSpan && ord.ref_number) {
          orderNameSpan.innerText = ord.ref_number;
        }

        if (banner) {
          let trackingText = `🚚 ${ord.courier_name || 'Courier'}: <strong>${ord.courier_status || ord.delivery_status}</strong>`;
          if (ord.tracking_number) trackingText += ` (#${ord.tracking_number})`;
          banner.innerHTML = trackingText;
        }

        if (waBtn && waContainer && ord.clean_phone) {
          const waMsg = encodeURIComponent(`Assalam-o-Alaikum ${ord.customer_name},\nRegarding your Order ${ord.ref_number} from Trace...\nStatus: ${ord.courier_status || ord.delivery_status}`);
          waBtn.href = `https://wa.me/${ord.clean_phone}?text=${waMsg}`;
          waContainer.style.setProperty('display', 'block', 'important');
        }
      } else {
        if (banner) banner.innerHTML = `🚚 Status: <strong>Shopify Admin Order</strong>`;
      }
    } catch (err) {
      console.warn('[TRACE CS Tagger Info Error]:', err);
    }
  }

  // -------------------------------------------------------------
  // ORDERS LIST VIEW — DIRECT WHATSAPP CHAT + READY TO BOOK + CANCEL
  // -------------------------------------------------------------
  function injectOrderListRowActions() {
    const orderLinks = document.querySelectorAll('a[href*="/orders/"]');
    orderLinks.forEach(link => {
      if (link.getAttribute('data-trace-cs-injected') === 'true') return;

      const href = link.getAttribute('href') || '';
      const match = href.match(/\/orders\/(\d+)/);
      if (!match) return;
      const shopifyOrderId = match[1];

      const orderText = link.innerText ? link.innerText.trim() : '';
      if (!orderText || orderText.length < 2) return;
      if (!/^TR\d+/i.test(orderText) && !/^#TR\d+/i.test(orderText) && !/^\d+$/i.test(orderText)) return;

      link.setAttribute('data-trace-cs-injected', 'true');

      const actionContainer = document.createElement('span');
      actionContainer.className = 'trace-row-action-bar';
      actionContainer.style.cssText = `
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        margin-left: 6px !important;
        vertical-align: middle !important;
      `;

      actionContainer.innerHTML = `
        <button type="button" class="trace-row-wa-btn" style="background: #059669 !important; color: #ffffff !important; border: 1px solid #10b981 !important; border-radius: 4px !important; padding: 1px 5px !important; font-size: 9.5px !important; font-weight: 700 !important; cursor: pointer !important; display: inline-flex !important; align-items: center !important; gap: 2px !important;" title="Open WhatsApp Chat with Customer">💬 WhatsApp</button>
        <button type="button" class="trace-row-btn" data-tag="Ready to Book" style="background: rgba(236, 72, 153, 0.15) !important; color: #ec4899 !important; border: 1px solid #ec4899 !important; border-radius: 4px !important; padding: 1px 4px !important; font-size: 9px !important; font-weight: 700 !important; cursor: pointer !important;" title="Tag Ready to Book">📋 Book</button>
        <button type="button" class="trace-row-btn" data-tag="Cancel Request" style="background: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid #ef4444 !important; border-radius: 4px !important; padding: 1px 4px !important; font-size: 9px !important; font-weight: 700 !important; cursor: pointer !important;" title="Tag Cancel Request">🔴 Cancel</button>
      `;

      // Tag Click Handlers (Book / Cancel)
      actionContainer.querySelectorAll('.trace-row-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const tag = btn.getAttribute('data-tag');
          btn.style.opacity = '0.4';

          try {
            const res = await fetch(ERP_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shopify_order_id: shopifyOrderId, tag, action: 'add' })
            });
            const data = await res.json();
            if (data.success) {
              createNotificationToast(`✅ Order ${orderText}: Tag "${tag}" applied!`, 'success');
              btn.style.background = '#10b981';
              btn.style.color = '#ffffff';
            } else {
              createNotificationToast(`⚠️ ${data.error || 'Failed'}`, 'error');
            }
          } catch (err) {
            createNotificationToast(`❌ Network Error`, 'error');
          } finally {
            btn.style.opacity = '1';
          }
        });
      });

      // Direct WhatsApp Button Click Handler
      const waBtn = actionContainer.querySelector('.trace-row-wa-btn');
      waBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const phone = waBtn.getAttribute('data-phone');
        if (phone) {
          const name = waBtn.getAttribute('data-name') || 'Customer';
          const ref = waBtn.getAttribute('data-ref') || orderText;
          const status = waBtn.getAttribute('data-status') || '';
          const msg = encodeURIComponent(`Assalam-o-Alaikum ${name},\nRegarding your Order ${ref} from Trace...\nStatus: ${status}`);
          window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
          return;
        }

        waBtn.style.opacity = '0.5';
        try {
          const res = await fetch(`${ERP_INFO_URL}?shopify_order_id=${encodeURIComponent(orderText)}`);
          const infoData = await res.json();
          if (infoData.success && infoData.order && infoData.order.clean_phone) {
            const ord = infoData.order;
            waBtn.setAttribute('data-phone', ord.clean_phone);
            waBtn.setAttribute('data-name', ord.customer_name || 'Customer');
            waBtn.setAttribute('data-ref', ord.ref_number || orderText);
            waBtn.setAttribute('data-status', ord.courier_status || ord.delivery_status);
            const msg = encodeURIComponent(`Assalam-o-Alaikum ${ord.customer_name},\nRegarding your Order ${ord.ref_number} from Trace...\nStatus: ${ord.courier_status || ord.delivery_status}`);
            window.open(`https://wa.me/${ord.clean_phone}?text=${msg}`, '_blank');
          } else {
            createNotificationToast(`⚠️ Phone number not found for ${orderText}`, 'error');
          }
        } catch (err) {
          createNotificationToast(`❌ Failed to load WhatsApp link`, 'error');
        } finally {
          waBtn.style.opacity = '1';
        }
      });

      // Background Pre-fetch for Instant 1-Click WhatsApp
      fetch(`${ERP_INFO_URL}?shopify_order_id=${encodeURIComponent(orderText)}`)
        .then(res => res.json())
        .then(infoData => {
          if (infoData.success && infoData.order && infoData.order.clean_phone) {
            const ord = infoData.order;
            waBtn.setAttribute('data-phone', ord.clean_phone);
            waBtn.setAttribute('data-name', ord.customer_name || 'Customer');
            waBtn.setAttribute('data-ref', ord.ref_number || orderText);
            waBtn.setAttribute('data-status', ord.courier_status || ord.delivery_status);
          }
        }).catch(() => {});

      if (link.parentNode) {
        link.parentNode.appendChild(actionContainer);
      }
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
    else if (key === 'R' || key === 'A') matchedTag = 'Ready to Book';
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
      injectOrderListRowActions();
    }
  }, 1200);

  // Initial Run
  setTimeout(() => {
    injectTaggingWidget();
    injectOrderListRowActions();
  }, 800);
})();
