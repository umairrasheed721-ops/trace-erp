/**
 * Trace ERP WhatsApp Web Helper — WhatsApp Content Script
 * Runs on: https://web.whatsapp.com/*
 *
 * Listens for TRACE_WA_INJECT messages from background worker and:
 * 1. Auto-types the order message into the input box
 * 2. Copies product image to clipboard and notifies user
 * 3. Shows a floating overlay with order info and image previews
 */

'use strict';

let lastInjectedOrderId = null;

// ── Listen for background bridge messages ──────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TRACE_WA_INJECT') {
    handleWAInject(request);
    sendResponse({ ok: true });
  }
});

async function handleWAInject({ phone, message, imageUrls = [], orderId }) {
  // Debounce — don't double-inject the same order
  if (lastInjectedOrderId === orderId) return;
  lastInjectedOrderId = orderId;
  setTimeout(() => { lastInjectedOrderId = null; }, 10000);

  showTraceOverlay({ message, imageUrls, orderId });

  // Wait for WA chat input to be available
  await waitForChatInput();
  await sleep(500);
  injectMessageText(message);
}

// ── Auto-type message into WA input box ────────────────────────────────────
function injectMessageText(text) {
  // WhatsApp Web uses a contenteditable div — we must use execCommand
  const input = findChatInput();
  if (!input) {
    console.warn('[Trace WA Helper] Chat input not found');
    return;
  }

  input.focus();

  // Clear existing content
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  // Insert text using insertText (preserves WA formatting)
  document.execCommand('insertText', false, text);

  // Trigger React synthetic events so WA recognises the input
  const inputEvent = new InputEvent('input', { bubbles: true, data: text });
  input.dispatchEvent(inputEvent);
}

function findChatInput() {
  // WA Web 2024/2025 selectors
  const selectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-tab="6"]',
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function waitForChatInput(maxWait = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (findChatInput()) return true;
    await sleep(500);
  }
  return false;
}

// ── Floating Overlay UI ────────────────────────────────────────────────────
function showTraceOverlay({ message, imageUrls, orderId }) {
  // Remove any existing overlay
  const old = document.getElementById('trace-wa-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'trace-wa-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 99999;
    width: 320px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #f1f5f9;
    overflow: hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(90deg, rgba(16,185,129,0.2), rgba(59,130,246,0.2));
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;
  header.innerHTML = `
    <span style="font-size:12px; font-weight:700; color:#4ade80; letter-spacing:0.5px;">
      🔌 TRACE ERP — Auto-Inject Active
    </span>
    <button id="trace-wa-close" style="
      background:none; border:none; cursor:pointer;
      color:#94a3b8; font-size:16px; line-height:1; padding:0;
    ">✕</button>
  `;

  const body = document.createElement('div');
  body.style.cssText = 'padding: 12px 14px;';

  // Message preview
  const msgPreview = document.createElement('div');
  msgPreview.style.cssText = `
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 11px;
    color: #cbd5e1;
    max-height: 80px;
    overflow-y: auto;
    margin-bottom: 10px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  `;
  msgPreview.textContent = message.substring(0, 200) + (message.length > 200 ? '...' : '');

  body.appendChild(msgPreview);

  // Image thumbnails + copy buttons
  if (imageUrls.length > 0) {
    const imgLabel = document.createElement('div');
    imgLabel.style.cssText = 'font-size:10px; color:#64748b; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;';
    imgLabel.textContent = `📎 ${imageUrls.length} Product Image${imageUrls.length > 1 ? 's' : ''} — Click to Copy`;
    body.appendChild(imgLabel);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-bottom:10px;';

    imageUrls.slice(0, 9).forEach((url, i) => {
      const thumb = document.createElement('div');
      thumb.style.cssText = `
        position: relative;
        cursor: pointer;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.1);
        aspect-ratio: 1;
        background: #0f172a;
      `;
      thumb.title = `Click to copy image ${i + 1} to clipboard`;

      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%; height:100%; object-fit:cover;';

      const badge = document.createElement('div');
      badge.style.cssText = `
        position:absolute; inset:0; background:rgba(0,0,0,0);
        display:flex; align-items:center; justify-content:center;
        font-size:18px; opacity:0; transition:0.2s;
      `;
      badge.textContent = '📋';

      thumb.addEventListener('mouseenter', () => { badge.style.opacity = '1'; thumb.style.background='rgba(74,222,128,0.15)'; });
      thumb.addEventListener('mouseleave', () => { badge.style.opacity = '0'; thumb.style.background='#0f172a'; });

      thumb.addEventListener('click', async () => {
        await copyImageToClipboard(url);
        badge.textContent = '✅';
        badge.style.opacity = '1';
        setTimeout(() => { badge.textContent = '📋'; badge.style.opacity = '0'; }, 2000);
      });

      thumb.appendChild(img);
      thumb.appendChild(badge);
      grid.appendChild(thumb);
    });

    body.appendChild(grid);

    // Copy All Images button
    if (imageUrls.length > 0) {
      const copyAllBtn = document.createElement('button');
      copyAllBtn.style.cssText = `
        width:100%; padding:7px 10px;
        background: linear-gradient(135deg, rgba(16,185,129,0.3), rgba(59,130,246,0.2));
        border: 1px solid rgba(74,222,128,0.3);
        border-radius: 8px; color:#4ade80; font-size:11px; font-weight:600;
        cursor:pointer; margin-bottom:8px; letter-spacing:0.3px;
        transition: 0.2s;
      `;
      copyAllBtn.textContent = '📋 Copy First Image to Clipboard';
      copyAllBtn.addEventListener('mouseenter', () => copyAllBtn.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.5), rgba(59,130,246,0.4))');
      copyAllBtn.addEventListener('mouseleave', () => copyAllBtn.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(59,130,246,0.2))');
      copyAllBtn.addEventListener('click', async () => {
        await copyImageToClipboard(imageUrls[0]);
        copyAllBtn.textContent = '✅ Copied! Now paste (Ctrl+V) in chat';
        setTimeout(() => { copyAllBtn.textContent = '📋 Copy First Image to Clipboard'; }, 4000);
      });
      body.appendChild(copyAllBtn);
    }
  }

  // Send button (hit Enter in chat)
  const sendBtn = document.createElement('button');
  sendBtn.style.cssText = `
    width:100%; padding:8px 10px;
    background: linear-gradient(135deg, #10b981, #059669);
    border: none; border-radius: 8px; color:#fff;
    font-size:12px; font-weight:700; cursor:pointer;
    letter-spacing:0.5px; transition:0.2s;
  `;
  sendBtn.textContent = '🚀 Send Message (Press Enter)';
  sendBtn.addEventListener('click', () => {
    const input = findChatInput();
    if (input) {
      input.focus();
      const evt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
      input.dispatchEvent(evt);
    }
  });
  body.appendChild(sendBtn);

  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  // Auto-dismiss after 45 seconds
  const autoDismiss = setTimeout(() => overlay.remove(), 45000);

  document.getElementById('trace-wa-close').addEventListener('click', () => {
    clearTimeout(autoDismiss);
    overlay.remove();
  });
}

// ── Copy Image to Clipboard via Fetch + ClipboardItem ─────────────────────
async function copyImageToClipboard(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    // Convert to PNG if needed (clipboard only accepts image/png on most browsers)
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      pngBlob = await convertBlobToPng(blob);
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
  } catch (err) {
    console.warn('[Trace WA] Clipboard write failed:', err.message);
    // Fallback: open image in new tab for manual copy
    window.open(url, '_blank');
  }
}

async function convertBlobToPng(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.src = URL.createObjectURL(blob);
  });
}

// ── Utility ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

console.log('[Trace WA Helper] WhatsApp Web content script loaded ✅');
