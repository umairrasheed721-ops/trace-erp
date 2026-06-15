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
const { parseReviewToken } = require('../services/reviewEmailService');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';

// ─────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/public/reviews
// Query: ?handle=texture-white OR ?handles=texture-white,texture-black
// Returns approved reviews + rating summary
// ─────────────────────────────────────────────────────────────────
router.get('/reviews', (req, res) => {
  try {
    const { handle, handles, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let handleList = [];
    if (handles) {
      handleList = handles.split(',').map(h => h.trim()).filter(Boolean);
    } else if (handle) {
      handleList = [handle.trim()];
    }

    if (handleList.length === 0) {
      return res.json({ success: true, data: { reviews: [], summary: { total: 0, avg: 0, distribution: {} } } });
    }

    // Build placeholder string for SQL IN clause
    const placeholders = handleList.map(() => '?').join(',');

    // Summary: avg rating + total + distribution
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        ROUND(AVG(rating), 1) as avg,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1
      FROM product_reviews
      WHERE product_handle IN (${placeholders}) AND status = 'approved'
    `).get(...handleList);

    // Reviews paginated, newest first
    const reviews = db.prepare(`
      SELECT id, product_handle, reviewer_name, rating, title, body, review_date, location, picture_urls
      FROM product_reviews
      WHERE product_handle IN (${placeholders}) AND status = 'approved'
      ORDER BY review_date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...handleList, parseInt(limit), offset);

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

    const placeholders = handleList.map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT 
        product_handle,
        COUNT(*) as total,
        ROUND(AVG(rating), 1) as avg
      FROM product_reviews
      WHERE product_handle IN (${placeholders}) AND status = 'approved'
      GROUP BY product_handle
    `).all(...handleList);

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
// Renders an HTML form for the customer to submit their review
// ─────────────────────────────────────────────────────────────────
router.get('/review-form', (req, res) => {
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

  // Check if already reviewed
  const existing = db.prepare('SELECT id FROM product_reviews WHERE reviewer_email = ? AND product_handle = ? LIMIT 1')
    .get(parsed.customerEmail, parsed.productHandle);

  if (existing) {
    return res.send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff;">
        <h2>✅ Already Reviewed!</h2>
        <p style="color:#888;">You've already submitted a review for this product. Thank you!</p>
        <a href="https://tracepk.com" style="color:#aaa;">Continue Shopping →</a>
      </body></html>
    `);
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Write a Review – TRACE Pakistan</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#141414;border:1px solid #222;border-radius:20px;padding:40px;width:100%;max-width:500px;box-shadow:0 40px 80px rgba(0,0,0,0.6)}
    .brand{text-align:center;margin-bottom:32px}
    .brand h1{font-size:24px;font-weight:900;letter-spacing:6px;text-transform:uppercase}
    .brand p{font-size:11px;color:#555;letter-spacing:3px;margin-top:4px;text-transform:uppercase}
    h2{font-size:20px;font-weight:700;margin-bottom:8px}
    .sub{font-size:14px;color:#888;margin-bottom:28px}
    .stars{display:flex;gap:8px;margin-bottom:24px;flex-direction:row-reverse;justify-content:flex-end}
    .stars input{display:none}
    .stars label{font-size:36px;cursor:pointer;color:#333;transition:color 0.15s}
    .stars label:hover,.stars label:hover~label,.stars input:checked~label{color:#FFD700}
    .field{margin-bottom:18px}
    .field label{display:block;font-size:12px;font-weight:600;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:8px}
    .field input,.field textarea{width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;color:#fff;font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s}
    .field input:focus,.field textarea:focus{border-color:#444}
    .field textarea{height:100px;resize:vertical}
    .btn{width:100%;padding:16px;background:#fff;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:opacity 0.2s}
    .btn:hover{opacity:0.85}
    .btn:disabled{opacity:0.4;cursor:not-allowed}
    .msg{margin-top:16px;text-align:center;font-size:14px;min-height:20px;color:#888}
    .msg.success{color:#4ade80}
    .msg.error{color:#f87171}
    .rating-err{font-size:12px;color:#f87171;display:none;margin-bottom:12px}
  </style>
</head>
<body>
<div class="card">
  <div class="brand"><h1>TRACE</h1><p>Premium Streetwear</p></div>
  <h2>How was your experience?</h2>
  <p class="sub">Share your honest feedback — it helps us and other shoppers.</p>

  <form id="reviewForm">
    <input type="hidden" name="token" value="${token}">

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
      <input type="text" name="name" placeholder="e.g. Ahmed K." required maxlength="80">
    </div>

    <div class="field">
      <label>Review Title</label>
      <input type="text" name="title" placeholder="e.g. Great quality!" maxlength="120">
    </div>

    <div class="field">
      <label>Your Review *</label>
      <textarea name="body" placeholder="Tell us about fit, quality, and your overall experience..." required minlength="10" maxlength="2000"></textarea>
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

    btn.disabled = true;
    btn.textContent = 'Submitting...';
    msg.textContent = '';
    msg.className = 'msg';

    const data = {
      token: form.querySelector('[name="token"]').value,
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
        form.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:48px;margin-bottom:16px">🎉</div><h2>Thank You!</h2><p style="color:#888;margin-top:8px">Your review has been submitted and will appear shortly.</p><a href="https://tracepk.com" style="display:inline-block;margin-top:24px;color:#aaa;text-decoration:none;font-size:13px">← Back to TRACE</a></div>';
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
// Customer submits their review
// ─────────────────────────────────────────────────────────────────
router.post('/submit-review', (req, res) => {
  try {
    const { token, rating, name, title, body } = req.body;

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

    // Check for duplicate
    const existing = db.prepare('SELECT id FROM product_reviews WHERE reviewer_email = ? AND product_handle = ? LIMIT 1')
      .get(parsed.customerEmail, parsed.productHandle);
    if (existing) {
      return res.status(409).json({ success: false, error: 'You have already reviewed this product' });
    }

    // Insert as pending (manual moderation)
    db.prepare(`
      INSERT INTO product_reviews (product_handle, reviewer_name, reviewer_email, rating, title, body, source, status, review_date)
      VALUES (?, ?, ?, ?, ?, ?, 'customer', 'pending', datetime('now'))
    `).run(parsed.productHandle, name.trim().substring(0, 80), parsed.customerEmail, ratingNum,
           title?.trim().substring(0, 120) || null, body.trim().substring(0, 2000));

    console.log(`⭐ [Reviews] New pending review from ${parsed.customerEmail} for ${parsed.productHandle} (${ratingNum}★)`);

    res.json({ success: true, message: 'Review submitted and pending approval' });
  } catch (err) {
    console.error('[Submit Review] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/reviews  — Admin list all reviews
// ─────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 50, handle } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

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

module.exports = router;

