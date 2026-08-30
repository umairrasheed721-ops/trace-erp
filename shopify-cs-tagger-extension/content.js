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
    toast.innerHTML = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('trace-cs-toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('trace-cs-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async function sendTagToErp(shopifyOrderId, tag, action = 'add', buttonEl) {
    if (buttonEl) buttonEl.classList.add('trace-btn-loading');

    try {
      const response = await fetch(ERP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_order_id: shopifyOrderId, tag, action })
      });

      const resData = await response.json();
      if (resData.success) {
        createNotificationToast(`✅ Tag <strong>"${tag}"</strong> ${action === 'add' ? 'applied' : 'removed'} to Order #${shopifyOrderId}!`, 'success');
      } else {
        createNotificationToast(`⚠️ Tagging Failed: ${resData.error || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error('[TRACE CS Tagger Error]:', err);
      createNotificationToast(`❌ Connection Error: Unable to reach TRACE ERP server`, 'error');
    } finally {
      if (buttonEl) buttonEl.classList.remove('trace-btn-loading');
    }
  }

  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.style.cursor = 'grab';

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON') return; // Don't drag when clicking minimize button
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

      // Keep within viewport boundaries
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
    if (document.getElementById('trace-cs-tagger-bar')) return;

    const orderId = extractShopifyOrderId();
    if (!orderId) return;

    const bar = document.createElement('div');
    bar.id = 'trace-cs-tagger-bar';
    bar.className = 'trace-cs-tagger-bar';

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
      <div class="trace-tagger-header" id="trace-cs-drag-handle" title="Click & Drag to move screen position">
        <span class="trace-tagger-logo">⚡ CS Tagger</span>
        <span class="trace-tagger-order">#${orderId.slice(-6)}</span>
        <button type="button" class="trace-min-btn" title="Minimize/Expand">—</button>
      </div>
      <div class="trace-tagger-body">
        <div class="trace-tagger-buttons">
    `;

    PRESET_TAGS.forEach(item => {
      html += `
        <button type="button" class="trace-tag-btn" data-tag="${item.tag}" style="--btn-color: ${item.color}" title="Shortcut: ${item.shortcut}">
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
    const minBtn = bar.querySelector('.trace-min-btn');
    const body = bar.querySelector('.trace-tagger-body');
    minBtn.addEventListener('click', () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      minBtn.innerText = isHidden ? '—' : '+';
    });

    // Attach Click Handlers
    bar.querySelectorAll('.trace-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
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

  // Observe URL changes (Shopify SPA navigation)
  let lastUrl = location.href;
  setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const existing = document.getElementById('trace-cs-tagger-bar');
      if (existing) existing.remove();
      setTimeout(injectTaggingWidget, 1000);
    } else {
      if (extractShopifyOrderId() && !document.getElementById('trace-cs-tagger-bar')) {
        injectTaggingWidget();
      }
    }
  }, 1500);

  // Initial Run
  setTimeout(injectTaggingWidget, 1200);
})();
