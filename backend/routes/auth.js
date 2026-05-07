const express = require('express');
const router = express.Router();
const { db, logAction } = require('../db');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TRACEPK_SCOPES = 'read_orders,write_orders,read_locations,read_inventory,read_customers,read_products,read_all_orders';
const JWT_SECRET = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, can_set_final_status: user.can_set_final_status },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logAction({
      user_id: user.id,
      action: 'USER_LOGIN',
      details: { username: user.username, ip: req.ip }
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        can_override_erp_status: user.can_override_erp_status === 1,
        permissions: JSON.parse(user.permissions || '[]')
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Get current user from token
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role, email, can_override_erp_status, permissions FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      can_override_erp_status: user.can_override_erp_status === 1,
      permissions: JSON.parse(user.permissions || '[]')
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/change-password - Change own password
router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Current password incorrect' });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(new_password, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/update-email - Update recovery email
router.post('/update-email', (req, res) => {
  const { email } = req.body;
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.user.id);
    res.json({ success: true, message: 'Email updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password - Start recovery
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found with that email' });

  // Generate a 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000; // 15 mins

  // Store in global memory for now (or a table if we want it persistent)
  global._resetCodes = global._resetCodes || {};
  global._resetCodes[email] = { code, expiry, userId: user.id };

  // Send Email (using nodemailer)
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: `"TRACE ERP Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Code",
      text: `Your password reset code is: ${code}. It expires in 15 minutes.`,
      html: `<h3>ERP Password Reset</h3><p>Your password reset code is: <b>${code}</b></p><p>It expires in 15 minutes.</p>`
    });
    res.json({ success: true, message: 'Recovery code sent' });
  } catch (err) {
    console.error('Email failed:', err.message);
    res.status(500).json({ error: 'Failed to send email. Check your SMTP settings.' });
  }
});

// POST /api/auth/reset-password - Verify code and set new password
router.post('/reset-password', async (req, res) => {
  const { email, code, new_password } = req.body;
  const entry = (global._resetCodes || {})[email];

  if (!entry || entry.code !== code || Date.now() > entry.expiry) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(new_password, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, entry.userId);
    delete global._resetCodes[email];
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/url - Generate Shopify OAuth URL for a given store
router.post('/url', (req, res) => {
  const { shop_domain, client_id, client_secret, postex_token, instaworld_key, instaworld_key_backup, store_name, sync_start_date } = req.body;

  if (!shop_domain || !client_id || !client_secret) {
    return res.status(400).json({ error: 'Missing shop_domain, client_id, or client_secret' });
  }

  const cleanDomain = shop_domain.replace('https://', '').replace('http://', '').replace(/\/$/, '').trim();
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
  // Prioritize Railway domain if available, otherwise use APP_URL or fallback to localhost
  const appUrl = railwayDomain || process.env.APP_URL || 'http://localhost:3001';
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Temporarily store setup data in DB with a placeholder token
  const existing = db.prepare('SELECT id FROM stores WHERE shop_domain = ?').get(cleanDomain);
  if (!existing) {
    db.prepare(`
      INSERT INTO stores (shop_domain, store_name, access_token, shopify_client_id, postex_token, instaworld_key, instaworld_key_backup, sync_start_date)
      VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?)
    `).run(cleanDomain, store_name || cleanDomain, client_id, postex_token || '', instaworld_key || '', instaworld_key_backup || '', sync_start_date || '');
  } else {
    db.prepare(`
      UPDATE stores SET shopify_client_id=?, postex_token=?, instaworld_key=?, instaworld_key_backup=?, store_name=?, sync_start_date=?
      WHERE shop_domain=?
    `).run(client_id, postex_token || '', instaworld_key || '', instaworld_key_backup || '', store_name || cleanDomain, sync_start_date || '', cleanDomain);
  }

  // Temporarily store client_secret in a separate temp table using properties
  // We'll store it in a simple in-memory map (since this is private app, this is fine)
  global._tempSecrets = global._tempSecrets || {};
  global._tempSecrets[cleanDomain] = client_secret;

  const authUrl = `https://${cleanDomain}/admin/oauth/authorize?client_id=${client_id}&scope=${TRACEPK_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.json({ auth_url: authUrl });
});

// GET /api/auth/callback - Shopify redirects here after install
router.get('/callback', async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send('<h2>❌ Missing shop or code parameter from Shopify.</h2>');
  }

  const storeRow = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shop);
  if (!storeRow) {
    return res.status(400).send('<h2>❌ Store not found. Please restart the connection process.</h2>');
  }

  const clientSecret = (global._tempSecrets || {})[shop];
  if (!clientSecret) {
    return res.status(400).send('<h2>❌ Client secret expired. Please restart the connection process.</h2>');
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: storeRow.shopify_client_id, client_secret: clientSecret, code })
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      return res.status(400).send(`<h2>❌ Token Exchange Failed</h2><pre>${JSON.stringify(data)}</pre>`);
    }

    db.prepare('UPDATE stores SET access_token = ? WHERE shop_domain = ?').run(data.access_token, shop);
    delete (global._tempSecrets || {})[shop];

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.send(`
      <html>
        <head><style>body{font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:#fff;}</style></head>
        <body>
          <h1 style="color:#22c55e;">✅ Store Connected!</h1>
          <p style="color:#aaa;">${shop} has been authenticated successfully.</p>
          <p style="color:#aaa;">You can close this tab and return to the ERP dashboard.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>❌ Network Error: ${err.message}</h2>`);
  }
});

module.exports = {
  router,
  authenticateToken
};
