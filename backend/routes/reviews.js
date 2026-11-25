/**
 * routes/reviews.js
 *
 * Reviews system routes — both public (no auth) and protected (admin).
 *
 * PUBLIC:
 *   GET  /api/public/reviews          - fetch approved reviews by handle(s)
 *   GET  /api/public/review-form      - HTML form for customers to submit review
 *   POST /api/public/submit-review    - customer submits a review via token
 *
 * PROTECTED (JWT required):
 *   GET  /api/reviews                 - admin: list all reviews (any status)
 *   PUT  /api/reviews/:id/approve     - admin: approve a review
 *   PUT  /api/reviews/:id/reject      - admin: reject a review
 *   DELETE /api/reviews/:id           - admin: delete a review
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const {
  parseReviewToken,
  resolveOrderReviewItems,
  getStoreEmailConfig,
  saveStoreEmailConfig,
  getEmailProviderStatus,
  saveStoreTemplate,
  resetStoreTemplate,
} = require('../services/reviewEmailService');
const {
  parseUnsubscribeToken,
  addUnsubscribe,
  sendReviewRewardEmail,
} = require('../services/remarketingEmailService');

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';

// ── Ensure store_id column exists on product_reviews ──
try {
  db.prepare('ALTER TABLE product_reviews ADD COLUMN store_id INTEGER').run();
} catch (_) {}

// ── Helper to resolve active store from request origin (Multi-Store Safe) ──
function getStoreFromRequest(req) {
  // 1. Check explicit shop query param (e.g. ?shop=72d3a1-e7.myshopify.com)
  const shopParam = req.query.shop || req.query.shop_domain || '';
  if (shopParam) {
    const byParam = db.prepare('SELECT id, shop_domain FROM stores WHERE shop_domain = ? OR shop_domain LIKE ? LIMIT 1')
      .get(shopParam, `%${shopParam}%`);
    if (byParam) return byParam;
  }

  // 2. Check Origin/Referer header
  const origin = req.get('origin') || req.get('referer') || '';
  let store = null;
  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      // Try direct match first, then partial (handles rabbitrends.com -> 72d3a1-e7.myshopify.com lookup via store name)
      store = db.prepare('SELECT id, shop_domain FROM stores WHERE shop_domain = ? OR shop_domain LIKE ? LIMIT 1')
        .get(hostname, `%${hostname}%`);
      // If not found by myshopify domain, try store_name or primary_domain match
      if (!store) {
        store = db.prepare("SELECT id, shop_domain FROM stores WHERE store_name LIKE ? OR JSON_EXTRACT(meta, '$.primary_domain') LIKE ? LIMIT 1")
          .get(`%${hostname}%`, `%${hostname}%`);
      }
    } catch (_) {}
  }

  // 3. Fallback to first store
  if (!store) {
    store = db.prepare('SELECT id, shop_domain FROM stores LIMIT 1').get();
  }
  return store;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/public/reviews
// Query: ?handle=texture-white OR ?handles=texture-white,texture-black
// Returns approved reviews + rating summary
// ─────────────────────────────────────────────────────────────────
router.get('/reviews', (req, res) => {
  try {
    const { handle, handles, page = 1, limit = 20, shop, shop_domain } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let handleList = [];
    if (handles) {
      handleList = handles.split(',').map(h => h.trim()).filter(Boolean);
    } else if (handle) {
      handleList = [handle.trim()];
    }

    let summary;
    let reviews;

    const store = getStoreFromRequest(req);
    const storeId = store ? store.id : null;

    if (handleList.length > 0) {
      // Build placeholder string for SQL IN clause
      const placeholders = handleList.map(() => '?').join(',');
      const params = [...handleList];
      let storeFilter = '';
      if (storeId) {
        storeFilter = ' AND (store_id = ? OR store_id IS NULL)';
        params.push(storeId);
      }

      // Summary: avg rating + total + distribution
      summary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          ROUND(AVG(rating), 1) as avg,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1
        FROM product_reviews
        WHERE product_handle IN (${placeholders}) AND status = 'approved'${storeFilter}
      `).get(...params);

      // Reviews paginated, newest first
      reviews = db.prepare(`
        SELECT id, product_handle, reviewer_name, rating, title, body, review_date, location, picture_urls
        FROM product_reviews
        WHERE product_handle IN (${placeholders}) AND status = 'approved'${storeFilter}
        ORDER BY review_date DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(...params, parseInt(limit), offset);
    } else {
      let storeFilter = '';
      const params = [];
      if (storeId) {
        storeFilter = ' AND (store_id = ? OR store_id IS NULL)';
        params.push(storeId);
      }

      // Summary for all products
      summary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          ROUND(AVG(rating), 1) as avg,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1
        FROM product_reviews
        WHERE status = 'approved'${storeFilter}
      `).get(...params);

      // Reviews paginated, newest first across all products
      reviews = db.prepare(`
        SELECT id, product_handle, reviewer_name, rating, title, body, review_date, location, picture_urls
        FROM product_reviews
        WHERE status = 'approved'${storeFilter}
        ORDER BY review_date DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(...params, parseInt(limit), offset);
    }

    return res.json({
      success: true,
      data: {
        summary: {
          total: summary.total || 0,
          avg: summary.avg || 0,
          distribution: {
            5: summary.r5 || 0,
            4: summary.r4 || 0,
            3: summary.r3 || 0,
            2: summary.r2 || 0,
            1: summary.r1 || 0,
          }
        },
        reviews: reviews.map(r => ({
          id: r.id,
          name: r.reviewer_name,
          rating: r.rating,
          title: r.title || '',
          body: r.body || '',
          date: r.review_date,
          location: r.location || '',
          handle: r.product_handle,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
        }
      }
    });
  } catch (err) {
    console.error('[Reviews API] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/public/reviews/bulk-summary
// Query: ?handles=handle1,handle2,handle3
// Returns a dictionary of { [handle]: { total, avg } }
// ─────────────────────────────────────────────────────────────────
router.get('/reviews/bulk-summary', (req, res) => {
  try {
    const { handles } = req.query;
    if (!handles) {
      return res.json({ success: true, data: {} });
    }

    const handleList = handles.split(',').map(h => h.trim()).filter(Boolean);
    if (handleList.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const store = getStoreFromRequest(req);
    const storeId = store ? store.id : null;

    const placeholders = handleList.map(() => '?').join(',');
    const params = [...handleList];
    let storeFilter = '';
    if (storeId) {
      storeFilter = ' AND (store_id = ? OR store_id IS NULL)';
      params.push(storeId);
    }

    const rows = db.prepare(`
      SELECT 
        product_handle,
        COUNT(*) as total,
        ROUND(AVG(rating), 1) as avg
      FROM product_reviews
      WHERE product_handle IN (${placeholders}) AND status = 'approved'${storeFilter}
      GROUP BY product_handle
    `).all(...params);

    const result = {};
    handleList.forEach(h => {
      result[h] = { total: 0, avg: 0 };
    });

    rows.forEach(row => {
      result[row.product_handle] = {
        total: row.total || 0,
        avg: row.avg || 0
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Reviews Bulk API] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch bulk summary' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/public/review-form?token=xxx
// Renders an HTML form for the customer to submit their review (with auto-resolved product listing & multi-item picker)
// ─────────────────────────────────────────────────────────────────
router.get('/review-form', async (req, res) => {
  const { token } = req.query;
  const parsed = parseReviewToken(token);

  if (!parsed) {
    return res.send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff;">
        <h2>⚠️ Invalid or Expired Link</h2>
        <p style="color:#888;">This review link has expired or is invalid. Please contact us at tracepk.com</p>
      </body></html>
    `);
  }

  // Resolve real Shopify product handle(s) & photos from the order (also auto-heals legacy 'general' links)
  let order = null;
  let reviewItems = [];
  if (parsed.orderId && /^\d+$/.test(String(parsed.orderId))) {
    order = db.prepare('SELECT id, store_id, ref_number, customer_name, line_items, product_titles FROM orders WHERE id = ?')
      .get(Number(parsed.orderId));
    if (order) {
      reviewItems = await resolveOrderReviewItems(order);
    }
  }
  if (reviewItems.length === 0) {
    reviewItems = [{
      handle: parsed.productHandle || 'general',
      title: parsed.orderId === 'TEST-PREVIEW' ? 'TRACE Heavyweight Oversized Hoodie' : (parsed.productHandle || 'Your TRACE item'),
      variant_title: '',
      image_url: ''
    }];
  }

  // Check which items this customer has already reviewed
  const reviewedRows = db.prepare('SELECT product_handle FROM product_reviews WHERE reviewer_email = ?')
    .all(parsed.customerEmail);
  const reviewedSet = new Set(reviewedRows.map(r => r.product_handle));

  const enrichedItems = reviewItems.map(item => ({
    ...item,
    alreadyReviewed: reviewedSet.has(item.handle)
  }));
  const unreviewedItems = enrichedItems.filter(i => !i.alreadyReviewed);

  const storeCfg = getStoreEmailConfig(order?.store_id || 1);
  const brandName = storeCfg.fromName || storeCfg.storeName || 'TRACE Pakistan';
  const storeWebsite = storeCfg.websiteUrl || 'https://tracepk.com';
  const storeWebsiteDisplay = storeWebsite.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  if (unreviewedItems.length === 0) {
    return res.send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff;">
        <h2>✅ Already Reviewed!</h2>
        <p style="color:#888;">You've already submitted a review for ${enrichedItems.length > 1 ? 'all items in this order' : 'this product'}. Thank you!</p>
        <a href="${escHtml(storeWebsite)}" style="color:#aaa;">Continue Shopping →</a>
      </body></html>
    `);
  }

  const defaultSelected = unreviewedItems[0];
  const prefillName = order?.customer_name ? escHtml(order.customer_name) : '';
  const orderBadge = order?.ref_number ? `Order ${escHtml(order.ref_number)}` : '';

  const productSectionHtml = enrichedItems.length > 1
    ? `
      <div class="field">
        <label>Select Product to Review *</label>
        <div class="product-list">
          ${enrichedItems.map((item, idx) => {
            const checked = item.handle === defaultSelected.handle ? 'checked' : '';
            const disabled = item.alreadyReviewed ? 'disabled' : '';
            return `
              <label class="product-option ${item.alreadyReviewed ? 'reviewed' : ''}">
                <input type="radio" name="product_handle" value="${escHtml(item.handle)}" ${checked} ${disabled}>
                ${item.image_url ? `<img src="${escHtml(item.image_url)}" alt="" class="prod-thumb">` : `<div class="prod-thumb placeholder">★</div>`}
                <div class="prod-info">
                  <div class="prod-title">${escHtml(item.title)}</div>
                  ${item.alreadyReviewed ? `<div class="prod-meta done">✓ Already reviewed</div>` : (item.variant_title ? `<div class="prod-meta">${escHtml(item.variant_title)}</div>` : '')}
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `
    : `
      <input type="hidden" name="product_handle" value="${escHtml(defaultSelected.handle)}">
      <div class="product-banner">
        ${defaultSelected.image_url ? `<img src="${escHtml(defaultSelected.image_url)}" alt="" class="prod-thumb">` : ''}
        <div class="prod-info">
          <div class="prod-title">${escHtml(defaultSelected.title)}</div>
          ${orderBadge ? `<div class="prod-meta">${orderBadge}</div>` : ''}
        </div>
      </div>
    `;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Write a Review – ${escHtml(brandName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#141414;border:1px solid #222;border-radius:20px;padding:36px;width:100%;max-width:500px;box-shadow:0 40px 80px rgba(0,0,0,0.6)}
    .brand{text-align:center;margin-bottom:24px}
    .brand h1{font-size:22px;font-weight:900;letter-spacing:4px;text-transform:uppercase}
    .brand p{font-size:11px;color:#666;letter-spacing:2px;margin-top:4px}
    h2{font-size:20px;font-weight:700;margin-bottom:6px}
    .sub{font-size:13.5px;color:#888;margin-bottom:20px}
    .product-banner{display:flex;align-items:center;gap:12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px;margin-bottom:20px}
    .product-list{display:flex;flex-direction:column;gap:8px}
    .product-option{display:flex;align-items:center;gap:12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;cursor:pointer;transition:border-color 0.15s}
    .product-option:has(input:checked){border-color:#fff;background:#202020}
    .product-option.reviewed{opacity:0.45;cursor:not-allowed}
    .product-option input{accent-color:#fff;width:16px;height:16px;flex-shrink:0}
    .prod-thumb{width:46px;height:46px;border-radius:8px;object-fit:cover;background:#222;flex-shrink:0}
    .prod-thumb.placeholder{display:flex;align-items:center;justify-content:center;color:#555;font-size:16px}
    .prod-info{min-width:0;flex:1}
    .prod-title{font-size:13.5px;font-weight:600;color:#fff;line-height:1.35}
    .prod-meta{font-size:11.5px;color:#888;margin-top:2px}
    .prod-meta.done{color:#4ade80}
    .stars{display:flex;gap:8px;margin-bottom:18px;flex-direction:row-reverse;justify-content:flex-end}
    .stars input{display:none}
    .stars label{font-size:36px;cursor:pointer;color:#333;transition:color 0.15s}
    .stars label:hover,.stars label:hover~label,.stars input:checked~label{color:#FFD700}
    .field{margin-bottom:16px}
    .field label{display:block;font-size:11.5px;font-weight:600;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:7px}
    .field input[type="text"],.field textarea{width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:13px 15px;color:#fff;font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s}
    .field input:focus,.field textarea:focus{border-color:#444}
    .field textarea{height:96px;resize:vertical}
    .btn{width:100%;padding:15px;background:#fff;color:#000;border:none;border-radius:10px;font-size:13.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;transition:opacity 0.2s}
    .btn:hover{opacity:0.88}
    .btn:disabled{opacity:0.4;cursor:not-allowed}
    .msg{margin-top:14px;text-align:center;font-size:13.5px;min-height:20px;color:#888}
    .msg.success{color:#4ade80}
    .msg.error{color:#f87171}
    .rating-err{font-size:12px;color:#f87171;display:none;margin-bottom:10px}
  </style>
</head>
<body>
<div class="card">
  <div class="brand"><h1>${escHtml(brandName)}</h1><p>${escHtml(storeWebsiteDisplay)}</p></div>
  <h2>How was your experience?</h2>
  <p class="sub">Share your honest feedback — it helps us and other shoppers.</p>

  <form id="reviewForm">
    <input type="hidden" name="token" value="${escHtml(token)}">
    ${productSectionHtml}

    <div class="field">
      <label>Your Rating *</label>
      <div class="stars">
        <input type="radio" name="rating" id="s5" value="5"><label for="s5">★</label>
        <input type="radio" name="rating" id="s4" value="4"><label for="s4">★</label>
        <input type="radio" name="rating" id="s3" value="3"><label for="s3">★</label>
        <input type="radio" name="rating" id="s2" value="2"><label for="s2">★</label>
        <input type="radio" name="rating" id="s1" value="1"><label for="s1">★</label>
      </div>
      <div class="rating-err" id="ratingErr">Please select a star rating.</div>
    </div>

    <div class="field">
      <label>Your Name *</label>
      <input type="text" name="name" value="${prefillName}" placeholder="e.g. Ahmed K." required maxlength="80">
    </div>

    <div class="field">
      <label>Review Title</label>
      <input type="text" name="title" placeholder="e.g. Great quality!" maxlength="120">
    </div>

    <div class="field">
      <label>Your Review *</label>
      <textarea name="body" placeholder="Tell us about fit, quality, and your overall experience..." required minlength="5" maxlength="2000"></textarea>
    </div>

    <button type="submit" class="btn" id="submitBtn">Submit Review</button>
    <div class="msg" id="msg"></div>
  </form>
</div>

<script>
  const form = document.getElementById('reviewForm');
  const msg = document.getElementById('msg');
  const btn = document.getElementById('submitBtn');
  const ratingErr = document.getElementById('ratingErr');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = form.querySelector('input[name="rating"]:checked')?.value;
    if (!rating) {
      ratingErr.style.display = 'block';
      return;
    }
    ratingErr.style.display = 'none';

    const selectedHandleEl = form.querySelector('input[name="product_handle"]:checked') || form.querySelector('input[name="product_handle"][type="hidden"]');
    const productHandle = selectedHandleEl ? selectedHandleEl.value : '';

    btn.disabled = true;
    btn.textContent = 'Submitting...';
    msg.textContent = '';
    msg.className = 'msg';

    const data = {
      token: form.querySelector('[name="token"]').value,
      product_handle: productHandle,
      rating: parseInt(rating),
      name: form.querySelector('[name="name"]').value.trim(),
      title: form.querySelector('[name="title"]').value.trim(),
      body: form.querySelector('[name="body"]').value.trim(),
    };

    try {
      const res = await fetch('${BACKEND_URL}/api/public/submit-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        const nextBtn = json.remainingItems > 0
          ? '<div style="margin-top:20px"><a href="' + window.location.href + '" style="display:inline-block;background:#fff;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px">Review your next item (' + json.remainingItems + ' left) →</a></div>'
          : '';
        form.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">🎉</div><h2>Thank You!</h2><p style="color:#888;margin-top:8px">Your review has been submitted and will appear on the product page shortly.</p>' + nextBtn + '<a href="${escHtml(storeWebsite)}" style="display:inline-block;margin-top:20px;color:#aaa;text-decoration:none;font-size:13px">← Back to ${escHtml(brandName)}</a></div>';
      } else {
        throw new Error(json.error || 'Submission failed');
      }
    } catch (err) {
      msg.textContent = '❌ ' + err.message;
      msg.className = 'msg error';
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  });
</script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/public/submit-review
// Customer submits their review (strictly bound to order's resolved Shopify product handle)
// ─────────────────────────────────────────────────────────────────
router.post('/submit-review', async (req, res) => {
  try {
    const { token, rating, name, title, body, product_handle: requestedHandle } = req.body;

    if (!token || !rating || !name || !body) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const parsed = parseReviewToken(token);
    if (!parsed) {
      return res.status(400).json({ success: false, error: 'Invalid or expired review link' });
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: 'Invalid rating' });
    }

    if (body.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Review is too short' });
    }

    // Resolve store_id & authorized product handle(s) from the order (also auto-heals legacy 'general' tokens)
    let storeId = null;
    let finalProductHandle = parsed.productHandle || 'general';
    let finalProductTitle = '';
    let orderHandles = [];
    if (parsed.orderId && /^\d+$/.test(String(parsed.orderId))) {
      const ord = db.prepare('SELECT id, store_id, line_items, product_titles FROM orders WHERE id = ?').get(Number(parsed.orderId));
      if (ord) {
        if (ord.store_id) storeId = ord.store_id;
        const resolvedItems = await resolveOrderReviewItems(ord);
        orderHandles = resolvedItems.map(i => i.handle).filter(Boolean);
        if (requestedHandle && orderHandles.includes(requestedHandle)) {
          finalProductHandle = requestedHandle;
        } else if (finalProductHandle === 'general' && orderHandles.length > 0) {
          finalProductHandle = orderHandles[0];
        } else if (orderHandles.length > 0 && !orderHandles.includes(finalProductHandle)) {
          finalProductHandle = orderHandles[0];
        }
        const matchedItem = resolvedItems.find(i => i.handle === finalProductHandle) || resolvedItems[0];
        if (matchedItem?.title) finalProductTitle = matchedItem.title;
      }
    }

    // Check for duplicate on this specific product handle
    const existing = db.prepare('SELECT id FROM product_reviews WHERE reviewer_email = ? AND product_handle = ? LIMIT 1')
      .get(parsed.customerEmail, finalProductHandle);
    if (existing) {
      return res.status(409).json({ success: false, error: 'You have already reviewed this product' });
    }

    // Insert as pending (manual moderation) — once approved, appears live on /products/<finalProductHandle>
    db.prepare(`
      INSERT INTO product_reviews (product_handle, reviewer_name, reviewer_email, rating, title, body, source, status, review_date, store_id)
      VALUES (?, ?, ?, ?, ?, ?, 'customer', 'pending', datetime('now'), ?)
    `).run(finalProductHandle, name.trim().substring(0, 80), parsed.customerEmail, ratingNum,
           title?.trim().substring(0, 120) || null, body.trim().substring(0, 2000), storeId);

    // Count remaining unreviewed items in this order (for multi-item Judge.me-style follow-up)
    let remainingItems = 0;
    if (orderHandles.length > 1) {
      const reviewedRows = db.prepare('SELECT product_handle FROM product_reviews WHERE reviewer_email = ?')
        .all(parsed.customerEmail);
      const reviewedSet = new Set(reviewedRows.map(r => r.product_handle));
      remainingItems = orderHandles.filter(h => !reviewedSet.has(h)).length;
    }

    console.log(`⭐ [Reviews] New pending review from ${parsed.customerEmail} for ${finalProductHandle} (${ratingNum}★, store=${storeId})`);

    // Flow #1 Autopilot: Instant Thank-You + Coupon Reward (non-blocking, strictly per-store isolated)
    if (storeId) {
      sendReviewRewardEmail({
        storeId,
        customerName: name.trim(),
        customerEmail: parsed.customerEmail,
        rating: ratingNum,
        productTitle: finalProductTitle || finalProductHandle.replace(/-/g, ' '),
      }).catch(e => console.error('[Review Reward Trigger] Error:', e.message));
    }

    res.json({ success: true, message: 'Review submitted and pending approval', product_handle: finalProductHandle, remainingItems });
  } catch (err) {
    console.error('[Submit Review] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/public/write-review
// Customer directly submits their review from the product page
// ─────────────────────────────────────────────────────────────────
router.post('/write-review', (req, res) => {
  try {
    const { handle, rating, name, email, title, body, shop_domain } = req.body;

    if (!handle || !rating || !name || !email || !body) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: 'Invalid rating' });
    }

    if (body.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Review is too short' });
    }

    // Inject shop_domain into query so getStoreFromRequest resolves correctly
    if (shop_domain) req.query.shop = shop_domain;
    const store = getStoreFromRequest(req);
    const storeId = store ? store.id : null;

    // Check for duplicate to prevent spamming
    const existing = db.prepare('SELECT id FROM product_reviews WHERE reviewer_email = ? AND product_handle = ? AND (store_id = ? OR store_id IS NULL) LIMIT 1')
      .get(email.trim().toLowerCase(), handle.trim(), storeId);
    if (existing) {
      return res.status(409).json({ success: false, error: 'You have already submitted a review for this product' });
    }

    // Insert as pending (manual moderation by admin)
    db.prepare(`
      INSERT INTO product_reviews (product_handle, reviewer_name, reviewer_email, rating, title, body, source, status, review_date, store_id)
      VALUES (?, ?, ?, ?, ?, ?, 'public_direct', 'pending', datetime('now'), ?)
    `).run(handle.trim(), name.trim().substring(0, 80), email.trim().toLowerCase(), ratingNum,
           title?.trim().substring(0, 120) || null, body.trim().substring(0, 2000), storeId);

    console.log(`⭐ [Reviews] Direct pending review from ${email} for ${handle} (${ratingNum}★) storeId=${storeId}`);

    if (storeId) {
      sendReviewRewardEmail({
        storeId,
        customerName: name.trim(),
        customerEmail: email.trim().toLowerCase(),
        rating: ratingNum,
        productTitle: handle.trim().replace(/-/g, ' '),
      }).catch(e => console.error('[Direct Review Reward Trigger] Error:', e.message));
    }

    res.json({ success: true, message: 'Review submitted and pending approval' });
  } catch (err) {
    console.error('[Write Direct Review] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/public/email-unsubscribe?token=...
// 1-Click Per-Store Unsubscribe Suppression (Primary-Inbox Compliance)
// ─────────────────────────────────────────────────────────────────
router.get('/email-unsubscribe', (req, res) => {
  try {
    const parsed = parseUnsubscribeToken(req.query.token);
    if (!parsed) {
      return res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Invalid Link</title></head>
<body style="margin:0;padding:48px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;color:#111827;text-align:center;">
  <div style="max-width:440px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;padding:32px 24px;">
    <h2 style="margin:0 0 8px;font-size:20px;">Invalid Unsubscribe Link</h2>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.5;">This opt-out link is invalid or incomplete. You can reply &quot;stop&quot; directly to the email to unsubscribe.</p>
  </div>
</body></html>`);
    }

    addUnsubscribe(parsed.storeId, parsed.email, 'link');
    const storeCfg = getStoreEmailConfig(parsed.storeId);
    const brandName = storeCfg.fromName || storeCfg.storeName || 'Our Store';
    const storeWebsite = storeCfg.websiteUrl || 'https://tracepk.com';

    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Unsubscribed – ${escHtml(brandName)}</title></head>
<body style="margin:0;padding:48px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;color:#111827;text-align:center;">
  <div style="max-width:440px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;padding:34px 26px;">
    <div style="width:44px;height:44px;border-radius:99px;background:#ecfdf5;color:#059669;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin-bottom:14px;">✓</div>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">You're unsubscribed</h2>
    <p style="margin:0 0 18px;color:#6b7280;font-size:14px;line-height:1.55;">
      <strong style="color:#111827;">${escHtml(parsed.email)}</strong> has been removed from future remarketing emails from <strong>${escHtml(brandName)}</strong>.
    </p>
    <p style="margin:0 0 22px;color:#9ca3af;font-size:12px;">You will still receive essential order confirmations and delivery updates if you place a new order.</p>
    <a href="${escHtml(storeWebsite)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">Return to ${escHtml(brandName)}</a>
  </div>
</body></html>`);
  } catch (err) {
    res.status(500).send('Unable to process unsubscribe request.');
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews  — Admin list all reviews
// ─────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 50, handle, store_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const targetStoreId = store_id || req.headers['x-active-store-id'];

    let sql = 'SELECT * FROM product_reviews';
    const params = [];
    const conditions = [];

    if (status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (handle) {
      conditions.push('product_handle = ?');
      params.push(handle);
    }
    if (targetStoreId) {
      conditions.push('(store_id = ? OR store_id IS NULL)');
      params.push(parseInt(targetStoreId));
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const reviews = db.prepare(sql).all(...params);

    // Count
    let countSql = 'SELECT COUNT(*) as c FROM product_reviews';
    const countParams = params.slice(0, -2);
    if (conditions.length) countSql += ' WHERE ' + conditions.join(' AND ');
    const { c: total } = db.prepare(countSql).get(...countParams);

    res.json({ success: true, data: { reviews, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PROTECTED: PUT /api/reviews/:id/approve
router.put('/:id/approve', (req, res) => {
  try {
    const result = db.prepare("UPDATE product_reviews SET status = 'approved' WHERE id = ?").run(parseInt(req.params.id));
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PROTECTED: PUT /api/reviews/:id/reject
router.put('/:id/reject', (req, res) => {
  try {
    const result = db.prepare("UPDATE product_reviews SET status = 'rejected' WHERE id = ?").run(parseInt(req.params.id));
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PROTECTED: DELETE /api/reviews/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare("DELETE FROM product_reviews WHERE id = ?").run(parseInt(req.params.id));
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews/campaigns/stats
// Returns email campaign stats for delivered orders within last X days
// ─────────────────────────────────────────────────────────────────
router.get('/campaigns/stats', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const targetStoreId = req.query.store_id || req.headers['x-active-store-id'];
    
    let storeFilter = '';
    const params = [];
    if (targetStoreId) {
      storeFilter = ' AND (store_id = ? OR store_id IS NULL)';
      params.push(parseInt(targetStoreId));
    }

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_delivered,
        SUM(CASE WHEN review_email_sent = 1 THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN (review_email_sent IS NULL OR review_email_sent = 0) AND email IS NOT NULL AND TRIM(email) != '' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN (review_email_sent IS NULL OR review_email_sent = 0) AND email IS NOT NULL AND TRIM(email) != '' AND datetime(status_date) <= datetime('now', '-24 hours') THEN 1 ELSE 0 END) as auto_ready,
        SUM(CASE WHEN review_email_sent = -1 OR ((review_email_sent IS NULL OR review_email_sent = 0) AND (email IS NULL OR TRIM(email) = '')) THEN 1 ELSE 0 END) as no_email
      FROM orders
      WHERE delivery_status IN ('Delivered', 'delivered')
        AND status_date IS NOT NULL
        AND datetime(status_date) >= datetime('now', '-${days} days')${storeFilter}
    `).get(...params);

    const sid = parseInt(targetStoreId) || 1;

    res.json({
      success: true,
      data: {
        daysWindow: days,
        totalDelivered: stats?.total_delivered || 0,
        sent: stats?.sent || 0,
        pending: stats?.pending || 0,
        autoReady: stats?.auto_ready || 0,
        noEmail: stats?.no_email || 0,
        emailProvider: getEmailProviderStatus(sid)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews/settings
// Plug & Play per-store email settings (returns masked API key only)
// ─────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  try {
    const sid = parseInt(req.query.store_id || req.headers['x-active-store-id']) || 1;
    const cfg = getStoreEmailConfig(sid);
    res.json({
      success: true,
      data: {
        storeId: cfg.storeId,
        storeName: cfg.storeName,
        shopDomain: cfg.shopDomain,
        enabled: cfg.enabled,
        provider: cfg.provider,
        hasApiKey: cfg.hasApiKey,
        maskedApiKey: cfg.maskedApiKey,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
        replyTo: cfg.replyTo,
        websiteUrl: cfg.websiteUrl,
        updatedAt: cfg.updatedAt,
        source: cfg.source,
        status: getEmailProviderStatus(sid),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: PUT /api/reviews/settings
// Save Plug & Play per-store email credentials (zero Railway vars!)
// ─────────────────────────────────────────────────────────────────
router.put('/settings', (req, res) => {
  try {
    const sid = parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id']) || 1;
    const saved = saveStoreEmailConfig(sid, req.body || {});
    res.json({
      success: true,
      message: `Email settings saved for ${saved.storeName}`,
      data: {
        storeId: saved.storeId,
        storeName: saved.storeName,
        shopDomain: saved.shopDomain,
        enabled: saved.enabled,
        provider: saved.provider,
        hasApiKey: saved.hasApiKey,
        maskedApiKey: saved.maskedApiKey,
        fromName: saved.fromName,
        fromEmail: saved.fromEmail,
        replyTo: saved.replyTo,
        websiteUrl: saved.websiteUrl,
        updatedAt: saved.updatedAt,
        status: getEmailProviderStatus(sid),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews/campaigns/orders
// Returns list of delivered orders in last X days with email status
// ─────────────────────────────────────────────────────────────────
router.get('/campaigns/orders', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const targetStoreId = req.query.store_id || req.headers['x-active-store-id'];
    const statusFilter = (req.query.status || 'all').toLowerCase();
    const search = (req.query.search || '').trim();

    let extraFilters = '';
    const params = [];
    if (targetStoreId) {
      extraFilters += ' AND (store_id = ? OR store_id IS NULL)';
      params.push(parseInt(targetStoreId));
    }
    if (statusFilter === 'sent') {
      extraFilters += ' AND review_email_sent = 1';
    } else if (statusFilter === 'pending') {
      extraFilters += " AND (review_email_sent IS NULL OR review_email_sent = 0) AND email IS NOT NULL AND TRIM(email) != ''";
    } else if (statusFilter === 'no_email') {
      extraFilters += " AND (review_email_sent = -1 OR ((review_email_sent IS NULL OR review_email_sent = 0) AND (email IS NULL OR TRIM(email) = '')))";
    }
    if (search) {
      const like = `%${search}%`;
      extraFilters += ' AND (ref_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR product_titles LIKE ?)';
      params.push(like, like, like, like);
    }

    const orders = db.prepare(`
      SELECT id, ref_number, customer_name, email, phone, product_titles, line_items,
             delivery_status, status_date, review_email_sent
      FROM orders
      WHERE delivery_status IN ('Delivered', 'delivered')
        AND status_date IS NOT NULL
        AND datetime(status_date) >= datetime('now', '-${days} days')${extraFilters}
      ORDER BY status_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const totalRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM orders
      WHERE delivery_status IN ('Delivered', 'delivered')
        AND status_date IS NOT NULL
        AND datetime(status_date) >= datetime('now', '-${days} days')${extraFilters}
    `).get(...params);

    res.json({
      success: true,
      data: {
        orders,
        total: totalRow?.total || 0,
        page,
        limit
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/reviews/campaigns/send-test
// Send a sample review request email using active store's isolated credentials
// ─────────────────────────────────────────────────────────────────
router.post('/campaigns/send-test', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim();
    const sid = parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id']) || 1;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Please enter a valid recipient email address.' });
    }
    const { sendReviewRequestEmail } = require('../services/reviewEmailService');
    const result = await sendReviewRequestEmail({
      storeId: sid,
      orderId: 'TEST-PREVIEW',
      orderRef: '#TR35089',
      customerName: 'Salar Khan',
      customerEmail: email,
      productHandle: 'sample-product',
      productTitle: 'Heavyweight Oversized Hoodie',
    });
    if (result && result.ok) {
      return res.json({ success: true, message: `Test email sent to ${email} from ${result.fromEmail} via ${result.provider}` });
    }
    return res.status(500).json({ success: false, error: (result && result.error) || 'Failed to send test email.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/reviews/campaigns/send-single
// Manually send review request email for a single order (strictly using order's store credentials)
// ─────────────────────────────────────────────────────────────────
router.post('/campaigns/send-single', async (req, res) => {
  try {
    const { order_id, email } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: 'Order ID is required' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    let customerEmail = email?.trim() || (order.email || '').trim();
    let productHandle = 'general';
    let productTitle = order.product_titles || 'your recent purchase';

    if (!customerEmail && order.line_items) {
      try {
        const items = JSON.parse(order.line_items);
        if (Array.isArray(items) && items.length > 0 && items[0].email) {
          customerEmail = items[0].email.trim();
        }
      } catch (_) {}
    }

    if (!customerEmail) {
      return res.status(400).json({ success: false, error: 'No email address available for this order. Please enter customer email.' });
    }

    // Resolve real Shopify product handle from products table / GraphQL so review attaches to exact listing
    const resolvedItems = await resolveOrderReviewItems(order);
    if (resolvedItems.length > 0) {
      productHandle = resolvedItems[0].handle;
      productTitle = resolvedItems.length > 1
        ? `${resolvedItems[0].title} (+${resolvedItems.length - 1} more)`
        : resolvedItems[0].title;
    }

    const { sendReviewRequestEmail } = require('../services/reviewEmailService');
    const result = await sendReviewRequestEmail({
      storeId: order.store_id || 1,
      orderId: order.id,
      orderRef: order.ref_number || `#${order.id}`,
      customerName: order.customer_name,
      customerEmail,
      productHandle,
      productTitle,
    });

    if (result && result.ok) {
      db.prepare("UPDATE orders SET review_email_sent = 1, email = ? WHERE id = ?").run(customerEmail, order.id);
      return res.json({ success: true, message: `Review email sent to ${customerEmail} from ${result.fromEmail}` });
    } else {
      return res.status(500).json({
        success: false,
        error: (result && result.error) || 'Failed to send email. Check Email Setup for this store.'
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/reviews/campaigns/trigger-scan
// Trigger review email scan strictly for the active store
// ─────────────────────────────────────────────────────────────────
router.post('/campaigns/trigger-scan', async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 7;
    const sid = parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id']) || 1;
    const { sendReviewEmails } = require('../scheduler');
    const result = await sendReviewEmails(days, sid);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Email scan failed', data: result });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews/templates/review_request
// Get per-store Review Email Template
// ─────────────────────────────────────────────────────────────────
router.get('/templates/review_request', (req, res) => {
  try {
    const sid = parseInt(req.query.store_id || req.headers['x-active-store-id']) || 1;
    const { getTemplateFromDb, DEFAULT_SUBJECT, DEFAULT_HTML } = require('../services/reviewEmailService');
    const tpl = getTemplateFromDb(sid);
    res.json({
      success: true,
      data: {
        storeId: sid,
        templateKey: 'review_request',
        subject: tpl.subject || DEFAULT_SUBJECT,
        bodyHtml: tpl.body_html || DEFAULT_HTML,
        defaults: { subject: DEFAULT_SUBJECT, bodyHtml: DEFAULT_HTML }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: PUT /api/reviews/templates/review_request
// Update per-store Review Email Template
// ─────────────────────────────────────────────────────────────────
router.put('/templates/review_request', (req, res) => {
  try {
    const sid = parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id']) || 1;
    const { subject, bodyHtml } = req.body;
    if (!subject || !bodyHtml) {
      return res.status(400).json({ success: false, error: 'Subject and body HTML are required' });
    }
    saveStoreTemplate(sid, subject, bodyHtml);
    res.json({ success: true, message: 'Email template updated for this store' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/reviews/templates/review_request/reset
// Reset per-store Review Email Template to Default
// ─────────────────────────────────────────────────────────────────
router.post('/templates/review_request/reset', (req, res) => {
  try {
    const sid = parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id']) || 1;
    resetStoreTemplate(sid);
    const { DEFAULT_SUBJECT, DEFAULT_HTML } = require('../services/reviewEmailService');
    res.json({
      success: true,
      message: 'Template reset to default',
      data: { subject: DEFAULT_SUBJECT, bodyHtml: DEFAULT_HTML }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

