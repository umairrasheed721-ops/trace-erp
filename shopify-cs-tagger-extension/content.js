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

  function formatInternationalPhone(phoneStr) {
    if (!phoneStr) return '';
    // Return RAW DIGITS ONLY — no + prefix — for whatsapp://send?phone= (macOS Desktop Native App)
    let clean = String(phoneStr).replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '92' + clean.slice(1);
    if (clean.length === 10 && clean.startsWith('3')) clean = '92' + clean;
    if (!clean.startsWith('92') && clean.length === 10) clean = '92' + clean;
    return clean; // e.g. "923225867200" — NO leading + sign
  }

  function isGenuineProductImage(url) {
    if (!url) return false;
    const lower = url.toLowerCase();

    // Blacklist non-product icons/logos/apps
    const blackList = [
      'postex', 'insta', 'leopard', 'tcs', 'trax', 'courier',
      'icon', 'badge', 'banner', 'avatar', 'store', 'app',
      'svg', 'favicon', 'placeholder', 'merchant', 'widget',
      'shopifycloud', 'gravatar', 'whatsapp', 'shop_logo', 'checkout'
    ];
    if (blackList.some(k => lower.includes(k))) return false;

    // Genuine Product Image Signature (Must have /products/ in CDN path)
    const hasProductsPath = lower.includes('/products/');
    const isStandardImg = lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp');

    return hasProductsPath && isStandardImg;
  }

  function extractOrderDetailsFromShopifyDOM() {
    const details = {
      customerName: '',
      phone: '',
      courierName: '',
      trackingNumber: '',
      trackingUrl: ''
    };

    try {
      const text = document.body.innerText || '';

      // Phone Number
      const phoneMatch = text.match(/(\+?92[\s\-]?3\d{2}[\s\-]?\d{7}|03\d{2}[\s\-]?\d{7}|\+?923\d{9})/g);
      if (phoneMatch && phoneMatch.length > 0) {
        details.phone = formatInternationalPhone(phoneMatch[0]);
      }

      // Courier Name
      const courierMatch = text.match(/(PostEx|Leopards|TCS|Trax|LCS|Instaworld|CallCourier)/i);
      if (courierMatch) details.courierName = courierMatch[0];

      // Tracking Number (e.g., 2912005026258)
      const trackingMatch = text.match(/(?:tracking[:\s]+|hxs_courier_tracking[:\s]+)(\w+)/i) || text.match(/\b(291\d+|LE\d+|\d{9,13})\b/);
      if (trackingMatch) details.trackingNumber = trackingMatch[1] || trackingMatch[0];

      // Tracking URL
      const urlMatch = text.match(/(https?:\/\/[^\s\n]+tracking[^\s\n]+)/i);
      if (urlMatch) details.trackingUrl = urlMatch[0];

      // Customer Name
      const custEl = document.querySelector('a[href*="/customers/"]');
      if (custEl && custEl.innerText) {
        details.customerName = custEl.innerText.trim();
      }

      // Product Images from DOM — Target ONLY genuine product links & images containing /products/
      details.productImages = [];
      const imgEls = document.querySelectorAll('a[href*="/products/"] img, img[src*="/products/"]');
      imgEls.forEach(img => {
        const src = img.src || img.getAttribute('src') || img.getAttribute('data-src');
        if (src && isGenuineProductImage(src) && details.productImages.length < 9 && !details.productImages.includes(src)) {
          details.productImages.push(src);
        }
      });
    } catch (e) {}

    return details;
  }

  function buildRichWhatsAppLink(ord, fallbackOrderName) {
    const domDetails = extractOrderDetailsFromShopifyDOM();

    const customerName = (ord && ord.customer_name && ord.customer_name !== 'Customer') ? ord.customer_name : (domDetails.customerName || 'Customer');
    const orderName = (ord && ord.ref_number) ? ord.ref_number : (fallbackOrderName || 'Order');

    let phone = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : domDetails.phone;

    const courierName = (ord && ord.courier_name && ord.courier_name !== 'Courier') ? ord.courier_name : (domDetails.courierName || '');
    const trackingNumber = (ord && ord.tracking_number) ? ord.tracking_number : (domDetails.trackingNumber || '');
    const courierStatus = (ord && ord.courier_status && ord.courier_status !== 'N/A') ? ord.courier_status : (ord?.delivery_status || '');
    let trackingUrl = domDetails.trackingUrl || '';
    if (!trackingUrl && trackingNumber) {
      if (courierName.toLowerCase().includes('postex')) trackingUrl = `https://postex.pk/tracking?cn=${trackingNumber}`;
      else trackingUrl = `https://tracepk.com/apps/tracking?tn=${trackingNumber}`;
    }

    let lines = [`Assalam-o-Alaikum ${customerName}! 👋`, ``, `Regarding your Order ${orderName} from Trace PK:`];

    if (courierName) lines.push(`🚚 Courier: ${courierName}`);
    if (courierStatus) lines.push(`📌 Status: ${courierStatus}`);
    if (trackingNumber) lines.push(`📦 Tracking #: ${trackingNumber}`);
    if (trackingUrl) lines.push(`🔗 Track Order: ${trackingUrl}`);

    lines.push(``);
    lines.push(`Thank you for shopping with Trace!`);

    const msgText = lines.join('\n');
    const encoded = encodeURIComponent(msgText);

    if (phone && phone.length >= 11) {
      return `whatsapp://send?phone=${phone}&text=${encoded}`;
    } else {
      return `whatsapp://send?text=${encoded}`;
    }
  }

  // Max 2 items summary formatter
  function formatItemsSummary(productTitles) {
    if (!productTitles) return '';
    const items = String(productTitles).split(',').map(s => s.trim()).filter(Boolean);
    if (items.length <= 2) return items.join(', ');
    return items.slice(0, 2).join(', ') + '... (' + items.length + ' items)';
  }

  // Order Confirmation Message — Rich format matching exact user template
  function buildConfirmLink(ord, fallbackOrderName) {
    const domDetails = extractOrderDetailsFromShopifyDOM();
    const customerName = (ord && ord.customer_name && ord.customer_name !== 'Customer') ? ord.customer_name : (domDetails.customerName || 'Customer');
    const orderName = (ord && ord.ref_number) ? ord.ref_number : (fallbackOrderName || 'Order');
    const rawPhone = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : domDetails.phone;
    const displayPhone = rawPhone ? rawPhone.replace(/^92(3\d{2})(\d{7})$/, '0$1-$2') : '';
    const price = (ord && ord.price) ? `${Math.round(ord.price)}` : '';
    const products = (ord && ord.product_titles) ? ord.product_titles : '';
    const address = (ord && ord.address && ord.city) ? `${ord.address}, ${ord.city}` : (ord && ord.city) ? ord.city : '';

    const lines = [
      `👋 Hello ${customerName} from Trace ERP!`,
      displayPhone ? displayPhone : '',
      ``,
      `We have received your COD order #${orderName}${price ? ` for Rs. ${price}` : ''}.`,
      ``,
      `Order Details:`,
      products ? `📦 Products: ${products}` : `📦 Products: N/A`,
      address ? `📍 Delivery Address: ${address}` : `📍 Delivery Address: N/A`,
      ``,
      `Please reply with:`,
      `1 - ✅ Confirm Order`,
      `2 - ❌ Cancel Order`,
      `3 - ✏️ Edit Address/Size`
    ];

    const encoded = encodeURIComponent(lines.join('\n'));
    return rawPhone ? `whatsapp://send?phone=${rawPhone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
  }

  function loadCardImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        const img2 = new Image();
        img2.onload = () => resolve(img2);
        img2.onerror = () => resolve(null);
        img2.src = url;
      };
      img.src = url;
    });
  }

  // Canvas Order Receipt Card Generator & Clipboard Writer (1-Click Screenshot)
  async function copyOrderCardToClipboard(ord, fallbackOrderName) {
    try {
      const domDetails = extractOrderDetailsFromShopifyDOM();
      const customerName = (ord && ord.customer_name && ord.customer_name !== 'Customer') ? ord.customer_name : (domDetails.customerName || 'Customer');
      const orderName = (ord && ord.ref_number) ? ord.ref_number : (fallbackOrderName || 'Order');
      const rawPhone = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : domDetails.phone;
      const displayPhone = rawPhone ? rawPhone.replace(/^92(3\d{2})(\d{7})$/, '0$1-$2') : '';
      const price = (ord && ord.price) ? `Rs. ${Math.round(ord.price)}` : '';
      const products = (ord && ord.product_titles) ? ord.product_titles : '';
      const address = (ord && ord.address && ord.city) ? `${ord.address}, ${ord.city}` : (ord && ord.city) ? ord.city : '';

      // Collect Multiple Product Image URLs (Max 9 thumbnails in 3x3 Grid — STRICT GENUINE PRODUCT FILTERING)
      let prodImgUrls = [];
      if (ord && Array.isArray(ord.line_items) && ord.line_items.length > 0) {
        ord.line_items.forEach(i => {
          const url = i.image_url || i.src || i.image || (i.image && i.image.src);
          if (url && !prodImgUrls.includes(url)) {
            const lower = url.toLowerCase();
            const isBad = ['postex', 'insta', 'leopard', 'tcs', 'trax', 'icon', 'badge', 'banner', 'avatar', 'store', 'app', 'svg', 'favicon', 'whatsapp'].some(k => lower.includes(k));
            if (!isBad) prodImgUrls.push(url);
          }
        });
      }
      if (domDetails.productImages && domDetails.productImages.length > 0) {
        domDetails.productImages.forEach(url => {
          if (url && isGenuineProductImage(url) && !prodImgUrls.includes(url)) prodImgUrls.push(url);
        });
      }
      prodImgUrls = prodImgUrls.slice(0, 9); // Up to 9 thumbnails

      const loadedImgs = await Promise.all(prodImgUrls.map(url => loadCardImage(url)));
      const validImgs = loadedImgs.filter(Boolean);

      // Calculate Total Quantity of Items
      let totalQty = 0;
      if (ord && Array.isArray(ord.line_items) && ord.line_items.length > 0) {
        ord.line_items.forEach(i => { totalQty += (parseInt(i.quantity) || 1); });
      } else {
        const matches = (products || '').match(/\(x(\d+)\)/g);
        if (matches) {
          matches.forEach(m => { totalQty += parseInt(m.replace(/\D/g, '')) || 1; });
        } else {
          totalQty = products ? products.split(',').length : 1;
        }
      }

      // Dynamic Canvas Height based on 3x3 Image Grid Rows
      const gridRows = validImgs.length > 6 ? 3 : validImgs.length > 3 ? 2 : 1;
      const extraH = (gridRows - 1) * 65;
      const width = 650;
      const height = 410 + extraH;

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      // Background Card Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, width, height, 16);
      else ctx.rect(0, 0, width, height);
      ctx.fill();

      // Card Outer Border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      if (ctx.roundRect) ctx.roundRect(1, 1, width - 2, height - 2, 16);
      else ctx.rect(1, 1, width - 2, height - 2);
      ctx.stroke();

      // Header Bar
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(0, 0, width, 52);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('⚡ TRACE ERP — ORDER RECEIPT', 20, 33);

      // Order Ref Header
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`#${orderName}`, width - 140, 33);

      let y = 86;

      // Total Price Pill Badge (Top Right Aligned — Zero Overlap Guaranteed)
      if (price) {
        const badgeText = `💰 Total: ${price}`;
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const badgeW = ctx.measureText(badgeText).width + 24;
        const badgeX = width - 20 - badgeW;

        ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(badgeX, y - 17, badgeW, 26, 6);
        else ctx.rect(badgeX, y - 17, badgeW, 26);
        ctx.fill();

        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.fillText(badgeText, badgeX + 12, y);
      }

      // Customer Name (Left Side — Safely Truncated if long)
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const maxCustW = width - 220;
      let truncCust = customerName;
      while (ctx.measureText(`👤 Customer: ${truncCust}`).width > maxCustW && truncCust.length > 5) {
        truncCust = truncCust.slice(0, -1);
      }
      if (truncCust !== customerName) truncCust += '...';
      ctx.fillText(`👤 Customer: ${truncCust}`, 20, y);

      y += 24;
      // Phone Number (Line 2)
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`📱 Phone: ${displayPhone || 'N/A'}`, 20, y);

      y += 22;
      // Separator
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();

      y += 28;
      // Products Section Title with Total Qty Count Badge
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`ORDERED PRODUCTS (${totalQty} ${totalQty === 1 ? 'ITEM' : 'ITEMS'} TOTAL):`, 20, y);

      // Render Multiple Product Thumbnails (3x3 Grid on the Right — Up to 9 images)
      if (validImgs.length > 0) {
        const thumbSize = 62;
        const gap = 6;
        const gridCols = Math.min(validImgs.length, 3);
        const gridW = (gridCols * thumbSize) + ((gridCols - 1) * gap);
        const startX = width - 20 - gridW;
        const startY = y - 10;

        validImgs.forEach((img, idx) => {
          const c = idx % 3;
          const r = Math.floor(idx / 3);
          const thumbX = startX + (c * (thumbSize + gap));
          const thumbY = startY + (r * (thumbSize + gap));

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 8);
          else ctx.rect(thumbX, thumbY, thumbSize, thumbSize);
          ctx.fill();

          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 8);
          else ctx.rect(thumbX, thumbY, thumbSize, thumbSize);
          ctx.clip();
          ctx.drawImage(img, thumbX, thumbY, thumbSize, thumbSize);
          ctx.restore();

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 8);
          else ctx.rect(thumbX, thumbY, thumbSize, thumbSize);
          ctx.stroke();
        });
      }

      y += 24;
      // Products Text Line (Truncated dynamically based on 3-col Grid)
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const maxProdW = validImgs.length > 0 ? (width - 230 - 30) : (width - 50);
      let truncProd = products || 'N/A';
      while (ctx.measureText(`📦 ${truncProd}`).width > maxProdW && truncProd.length > 5) {
        truncProd = truncProd.slice(0, -1);
      }
      if (truncProd !== products) truncProd += '...';
      ctx.fillText(`📦 ${truncProd}`, 20, y);

      y += (50 + extraH);
      // Address Title
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('DELIVERY ADDRESS:', 20, y);

      y += 24;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const maxAddrW = width - 40;
      let truncAddr = address || 'N/A';
      while (ctx.measureText(`📍 ${truncAddr}`).width > maxAddrW && truncAddr.length > 5) {
        truncAddr = truncAddr.slice(0, -1);
      }
      if (truncAddr !== address) truncAddr += '...';
      ctx.fillText(`📍 ${truncAddr}`, 20, y);

      y += 45;
      // Footer Bar
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, height - 36, width, 36);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Verified COD Order Dispatch • TRACE E-Commerce System', 20, height - 14);

      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return resolve(false);
          try {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            console.log('✅ Order Receipt Card image copied to clipboard!');
            createNotificationToast('📋 Order Receipt Card image copied to Clipboard! (Cmd+V)', 'success');
            resolve(true);
          } catch (clipErr) {
            console.warn('Clipboard write error:', clipErr);
            resolve(false);
          }
        }, 'image/png');
      });
    } catch (e) {
      console.warn('Order card copy error:', e);
      return false;
    }
  }

  // Shipping Update Message
  function buildShippingLink(ord, fallbackOrderName) {
    const customerName = (ord && ord.customer_name && ord.customer_name !== 'Customer') ? ord.customer_name : 'Customer';
    const orderName = (ord && ord.ref_number) ? ord.ref_number : (fallbackOrderName || 'Order');
    const phone = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : '';
    const courierName = (ord && ord.courier_name && ord.courier_name !== 'Courier') ? ord.courier_name : '';
    const trackingNumber = (ord && ord.tracking_number) ? ord.tracking_number : '';
    const courierStatus = (ord && ord.courier_status && ord.courier_status !== 'N/A') ? ord.courier_status : (ord?.delivery_status || '');
    let trackingUrl = '';
    if (trackingNumber) {
      trackingUrl = courierName.toLowerCase().includes('postex')
        ? `https://postex.pk/tracking?cn=${trackingNumber}`
        : `https://tracepk.com/apps/tracking?tn=${trackingNumber}`;
    }

    const lines = [
      `Assalam-o-Alaikum ${customerName}! 👋`,
      ``,
      `🚚 Aapka Order ${orderName} ship ho gaya!`,
      ``,
      courierName ? `📦 Courier: ${courierName}` : '',
      courierStatus ? `📌 Status: ${courierStatus}` : '',
      trackingNumber ? `🔢 Tracking #: ${trackingNumber}` : '',
      trackingUrl ? `🔗 Order Track Karein: ${trackingUrl}` : '',
      ``,
      `Koi bhi sawal ho to humse rabta karein. Shukriya! 🙏`
    ].filter(l => l !== null && l !== undefined);

    const encoded = encodeURIComponent(lines.join('\n'));
    return phone ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
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

        // If tagging Ready to Book, auto-remove "Sent WhatsApp Confirmation" from Shopify Order Notes!
        if (tag === 'Ready to Book') {
          try {
            fetch(ERP_NOTE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shopify_order_id: shopifyOrderId, mode: 'remove_keyword', remove_keyword: 'Sent WhatsApp Confirmation' })
            });
          } catch (_) {}
        }

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
      if (oldBar.getAttribute('data-version') === '10.7') return;
      oldBar.remove();
    }

    const orderId = extractShopifyOrderId();
    if (!orderId) return;

    const orderName = extractShopifyOrderName() || `#${orderId.slice(-6)}`;
    const initialWaUrl = buildRichWhatsAppLink(null, orderName);

    const bar = document.createElement('div');
    bar.id = 'trace-cs-tagger-bar';
    bar.setAttribute('data-version', '10.7');
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

        <div id="trace-cs-confirm-container" style="display: block !important; margin-top: 6px !important;">
          <a id="trace-cs-confirm-btn" href="#" style="display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; background: #1d4ed8 !important; color: #ffffff !important; text-decoration: none !important; border-radius: 6px !important; padding: 7px !important; font-size: 10.5px !important; font-weight: 800 !important; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.3) !important;" title="Send Pre-loaded Order Confirmation Message via WhatsApp">
            📦 Send Order Confirmation
          </a>
        </div>

        <div id="trace-cs-actions-container" style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 4px !important; margin-top: 4px !important;">
          <a id="trace-cs-wa-btn" href="${initialWaUrl}" style="display: flex !important; align-items: center !important; justify-content: center !important; gap: 4px !important; background: #059669 !important; color: #ffffff !important; text-decoration: none !important; border-radius: 6px !important; padding: 6px 4px !important; font-size: 10px !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important; white-space: nowrap !important;" title="Open WhatsApp Native Desktop App">
            💬 WhatsApp App
          </a>
          <a id="trace-cs-sim-btn" href="tel:" style="display: flex !important; align-items: center !important; justify-content: center !important; gap: 4px !important; background: #2563eb !important; color: #ffffff !important; text-decoration: none !important; border-radius: 6px !important; padding: 6px 4px !important; font-size: 10px !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3) !important; white-space: nowrap !important;" title="Direct Cellular SIM Phone Call">
            📞 Direct SIM Call
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

    let currentFetchedOrd = null;

    // Order Confirmation Button Click Listener (Auto Copy Receipt Screenshot + Open WhatsApp + Log Note)
    const confirmBtn = bar.querySelector('#trace-cs-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetUrl = confirmBtn.getAttribute('href');

        // Auto Sync "Sent WhatsApp Confirmation" Note to Shopify & TRACE ERP
        try {
          fetch(ERP_NOTE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopify_order_id: orderId, note: 'Sent WhatsApp Confirmation' })
          });
        } catch (_) {}

        // 1-Click: Auto Copy Order Receipt Card Image to Clipboard
        await copyOrderCardToClipboard(currentFetchedOrd, orderName);

        setTimeout(() => {
          if (targetUrl && targetUrl !== '#') {
            window.location.href = targetUrl;
          }
        }, 150);
      });
    }

    // WhatsApp Button Click Listener (Auto Copy Receipt Screenshot + Open WhatsApp + Log Note)
    const waBtn = bar.querySelector('#trace-cs-wa-btn');
    if (waBtn) {
      waBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetUrl = waBtn.getAttribute('href');

        // Auto Sync "Sent WhatsApp Confirmation" Note to Shopify & TRACE ERP
        try {
          fetch(ERP_NOTE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopify_order_id: orderId, note: 'Sent WhatsApp Confirmation' })
          });
        } catch (_) {}

        await copyOrderCardToClipboard(currentFetchedOrd, orderName);

        setTimeout(() => {
          if (targetUrl && targetUrl !== '#') {
            window.location.href = targetUrl;
          }
        }, 150);
      });
    }

    // Safe Fetch ERP Order Details & Enrich Links
    try {
      const infoRes = await fetch(`${ERP_INFO_URL}?shopify_order_id=${encodeURIComponent(orderId)}&ref_number=${encodeURIComponent(orderName)}`);
      const infoData = await infoRes.json();

      const liveBar = document.getElementById('trace-cs-tagger-bar');
      if (!liveBar) return;

      const banner = liveBar.querySelector('#trace-cs-tracking-banner');
      const orderNameSpan = liveBar.querySelector('#trace-cs-order-name');
      const liveConfirmBtn = liveBar.querySelector('#trace-cs-confirm-btn');
      const liveWaBtn = liveBar.querySelector('#trace-cs-wa-btn');

      const ord = (infoData && infoData.success && infoData.order) ? infoData.order : null;
      currentFetchedOrd = ord;
      if (ord) {
        if (orderNameSpan && ord.ref_number) {
          orderNameSpan.innerText = ord.ref_number;
        }

        if (banner) {
          let trackingText = `🚚 ${ord.courier_name || 'Courier'}: <strong>${ord.courier_status || ord.delivery_status}</strong>`;
          if (ord.tracking_number) trackingText += ` (#${ord.tracking_number})`;
          banner.innerHTML = trackingText;
        }
      } else {
        if (banner) banner.innerHTML = `🚚 Status: <strong>Shopify Admin Order</strong>`;
      }

      if (liveConfirmBtn) {
        liveConfirmBtn.href = buildConfirmLink(ord, orderName);
      }

      if (liveWaBtn) {
        liveWaBtn.href = buildRichWhatsAppLink(ord, orderName);
      }

      const liveSimBtn = liveBar.querySelector('#trace-cs-sim-btn');
      let phoneNum = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : extractOrderDetailsFromShopifyDOM().phone;
      if (phoneNum && liveSimBtn) {
        let cleanTel = phoneNum.startsWith('+') ? phoneNum : '+' + phoneNum;
        liveSimBtn.href = `tel:${cleanTel}`;
      }
    } catch (err) {
      console.warn('[TRACE CS Tagger Info Error]:', err);
    }
  }

  // -------------------------------------------------------------
  // ORDERS LIST VIEW — DIRECT WHATSAPP RICH CHAT LINK + READY TO BOOK
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

      const actionContainer = document.createElement('div');
      actionContainer.className = 'trace-row-action-bar';
      actionContainer.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 3px !important;
        margin-top: 4px !important;
        min-width: 280px !important;
        max-width: 360px !important;
        width: 100% !important;
      `;

      actionContainer.innerHTML = `
        <div class="trace-row-btn-line" style="display: flex !important; align-items: center !important; gap: 4px !important; flex-wrap: nowrap !important; white-space: nowrap !important;">
          <a class="trace-row-confirm-btn" href="${buildConfirmLink(null, orderText)}" style="background: #1d4ed8 !important; color: #ffffff !important; border: 1px solid #3b82f6 !important; border-radius: 4px !important; padding: 1px 5px !important; font-size: 9px !important; font-weight: 700 !important; text-decoration: none !important; display: inline-flex !important; align-items: center !important; gap: 2px !important;" title="Send Order Confirmation Message">📦 Confirm</a>
          <a class="trace-row-ship-btn" href="${buildShippingLink(null, orderText)}" style="background: #0369a1 !important; color: #ffffff !important; border: 1px solid #0ea5e9 !important; border-radius: 4px !important; padding: 1px 5px !important; font-size: 9px !important; font-weight: 700 !important; text-decoration: none !important; display: none !important; align-items: center !important; gap: 2px !important;" title="Send Shipping Update Message">🚚 Shipped</a>
          <button type="button" class="trace-row-btn" data-tag="Ready to Book" style="background: rgba(236, 72, 153, 0.15) !important; color: #ec4899 !important; border: 1px solid #ec4899 !important; border-radius: 4px !important; padding: 1px 5px !important; font-size: 9px !important; font-weight: 700 !important; cursor: pointer !important;" title="Tag Ready to Book">📋 Book</button>
          <a class="trace-row-phone" href="#" style="font-size: 11.5px !important; color: #0f172a !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-weight: 800 !important; white-space: nowrap !important; padding: 2px 7px !important; background: #f8fafc !important; border: 1.5px solid #0f172a !important; border-radius: 5px !important; text-decoration: none !important; cursor: pointer !important; letter-spacing: 0.3px !important;" title="Click to Call">📱 ...</a>
        </div>
        <div class="trace-row-addr-line" style="display: none; font-size: 9.5px !important; color: #334155 !important; font-weight: 600 !important; line-height: 1.2 !important; margin-top: 2px !important; background: #f8fafc !important; padding: 2px 6px !important; border-radius: 4px !important; border-left: 3px solid #3b82f6 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 340px !important;">
          📍 <span class="trace-addr-val">...</span>
        </div>
        <div class="trace-row-items-line" style="display: none; font-size: 9.5px !important; color: #0284c7 !important; font-weight: 600 !important; line-height: 1.2 !important; margin-top: 1px !important; background: #f0f9ff !important; padding: 2px 6px !important; border-radius: 4px !important; border-left: 3px solid #0284c7 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 340px !important;">
          📦 <span class="trace-items-val">...</span>
        </div>
        <div class="trace-row-notes-line" style="display: none; font-size: 9.5px !important; color: #d97706 !important; font-weight: 600 !important; line-height: 1.2 !important; margin-top: 1px !important; background: #fffbeb !important; padding: 2px 6px !important; border-radius: 4px !important; border-left: 3px solid #f59e0b !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 340px !important;">
          📝 <span class="trace-notes-val">...</span>
        </div>
      `;

      let rowOrd = null;

      // Click handlers for WA Confirm button (auto screenshot + note sync + WhatsApp launch)
      const confirmBtn = actionContainer.querySelector('.trace-row-confirm-btn');
      const shipBtn = actionContainer.querySelector('.trace-row-ship-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetUrl = confirmBtn.getAttribute('href');

          // 1. Auto Sync "Sent WhatsApp Confirmation" Note to Shopify & TRACE ERP
          try {
            fetch(ERP_NOTE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shopify_order_id: shopifyOrderId, note: 'Sent WhatsApp Confirmation' })
            });
          } catch (_) {}

          // 2. 1-Click: Auto Copy Order Receipt Card Screenshot to Clipboard
          await copyOrderCardToClipboard(rowOrd, orderText);

          // 3. Launch WhatsApp Desktop
          setTimeout(() => {
            if (targetUrl && targetUrl !== '#') {
              window.location.href = targetUrl;
            }
          }, 150);
        });
      }
      if (shipBtn) {
        shipBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const u = shipBtn.getAttribute('href'); if (u && u !== '#') window.location.href = u; });
      }

      // Tag Click Handler (Book)
      const bookBtn = actionContainer.querySelector('.trace-row-btn');
      if (bookBtn) {
        bookBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const tag = bookBtn.getAttribute('data-tag');
          bookBtn.style.opacity = '0.4';

          try {
            const res = await fetch(ERP_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shopify_order_id: shopifyOrderId, tag, action: 'add' })
            });
            const data = await res.json();
            if (data.success) {
              createNotificationToast(`✅ Order ${orderText}: Tag "${tag}" applied!`, 'success');
              bookBtn.style.background = '#10b981';
              bookBtn.style.color = '#ffffff';

              // Auto-remove "Sent WhatsApp Confirmation" note from Shopify
              try {
                fetch(ERP_NOTE_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ shopify_order_id: shopifyOrderId, mode: 'remove_keyword', remove_keyword: 'Sent WhatsApp Confirmation' })
                });
              } catch (_) {}
            } else {
              createNotificationToast(`⚠️ ${data.error || 'Failed'}`, 'error');
            }
          } catch (err) {
            createNotificationToast(`❌ Network Error`, 'error');
          } finally {
            bookBtn.style.opacity = '1';
          }
        });
      }

      // Fetch Phone + Update all WA message links + Display Phone, Address, Items & Notes Sub-lines
      const phoneBadge = actionContainer.querySelector('.trace-row-phone');
      const confirmBtnEl = actionContainer.querySelector('.trace-row-confirm-btn');
      const shipBtnEl = actionContainer.querySelector('.trace-row-ship-btn');
      const addrLineEl = actionContainer.querySelector('.trace-row-addr-line');
      const addrValEl = actionContainer.querySelector('.trace-addr-val');
      const itemsLineEl = actionContainer.querySelector('.trace-row-items-line');
      const itemsValEl = actionContainer.querySelector('.trace-items-val');
      const notesLineEl = actionContainer.querySelector('.trace-row-notes-line');
      const notesValEl = actionContainer.querySelector('.trace-notes-val');

      fetch(`${ERP_INFO_URL}?shopify_order_id=${shopifyOrderId}&ref_number=${encodeURIComponent(orderText)}`)
        .then(res => res.json())
        .then(infoData => {
          rowOrd = (infoData && infoData.success && infoData.order) ? infoData.order : null;
          if (confirmBtnEl) confirmBtnEl.href = buildConfirmLink(ord, orderText);
          if (shipBtnEl) {
            shipBtnEl.href = buildShippingLink(ord, orderText);
            const status = (ord && ord.delivery_status) ? ord.delivery_status.toLowerCase() : 'pending';
            const hasTracking = !!(ord && ord.tracking_number);
            const isShipped = hasTracking || !['pending', ''].includes(status);
            shipBtnEl.style.display = isShipped ? 'inline-flex' : 'none';
          }
          // Phone Badge — Bigger (11.5px), Extra Bold (800 weight), High-contrast border
          const rawPhone = (ord && ord.clean_phone) ? formatInternationalPhone(ord.clean_phone) : '';
          if (phoneBadge && rawPhone) {
            const display = rawPhone.replace(/^92(3\d{2})(\d{7})$/, '0$1-$2') || rawPhone;
            phoneBadge.textContent = `📱 ${display}`;
            phoneBadge.style.cssText = `font-size: 11.5px !important; color: #0f172a !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-weight: 800 !important; white-space: nowrap !important; padding: 2px 7px !important; background: #f8fafc !important; border: 1.5px solid #0f172a !important; border-radius: 5px !important; text-decoration: none !important; cursor: pointer !important; letter-spacing: 0.3px !important;`;
            phoneBadge.setAttribute('href', `tel:+${rawPhone}`);
            phoneBadge.setAttribute('title', `Call ${display}`);
          } else if (phoneBadge) {
            phoneBadge.textContent = '📱 N/A';
            phoneBadge.style.color = '#9ca3af !important';
          }

          // Address Sub-line (1 line truncated with ellipsis)
          const addressStr = (ord && ord.address && ord.city) ? `${ord.address}, ${ord.city}` : (ord && ord.city) ? ord.city : '';
          if (addrLineEl && addrValEl) {
            if (addressStr) {
              addrValEl.textContent = addressStr;
              addrLineEl.setAttribute('title', addressStr);
              addrLineEl.style.display = 'block';
            } else {
              addrLineEl.style.display = 'none';
            }
          }

          // Product Items Sub-line (Max 2 items truncated)
          const rawProducts = (ord && ord.product_titles) ? ord.product_titles : '';
          const productsSummary = formatItemsSummary(rawProducts);
          if (itemsLineEl && itemsValEl) {
            if (productsSummary) {
              itemsValEl.textContent = productsSummary;
              itemsLineEl.setAttribute('title', rawProducts);
              itemsLineEl.style.display = 'block';
            } else {
              itemsLineEl.style.display = 'none';
            }
          }

          // Customer Notes Sub-line (Line 4)
          const notesStr = (ord && ord.notes) ? ord.notes : '';
          if (notesLineEl && notesValEl) {
            if (notesStr) {
              notesValEl.textContent = notesStr;
              notesLineEl.setAttribute('title', notesStr);
              notesLineEl.style.display = 'block';
            } else {
              notesLineEl.style.display = 'none';
            }
          }
        }).catch(() => {
          if (phoneBadge) phoneBadge.textContent = '📱 —';
        });

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
