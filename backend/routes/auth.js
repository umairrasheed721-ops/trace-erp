const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');

const TRACEPK_SCOPES = 'read_orders,write_orders,read_locations,read_inventory,read_customers,read_products';

// GET /api/auth/url - Generate Shopify OAuth URL for a given store
router.post('/url', (req, res) => {
  const { shop_domain, client_id, client_secret, postex_token, instaworld_key, instaworld_key_backup, store_name } = req.body;

  if (!shop_domain || !client_id || !client_secret) {
    return res.status(400).json({ error: 'Missing shop_domain, client_id, or client_secret' });
  }

  const cleanDomain = shop_domain.replace('https://', '').replace('http://', '').replace(/\/$/, '').trim();
  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Temporarily store setup data in DB with a placeholder token
  const existing = db.prepare('SELECT id FROM stores WHERE shop_domain = ?').get(cleanDomain);
  if (!existing) {
    db.prepare(`
      INSERT INTO stores (shop_domain, store_name, access_token, shopify_client_id, postex_token, instaworld_key, instaworld_key_backup)
      VALUES (?, ?, 'PENDING', ?, ?, ?, ?)
    `).run(cleanDomain, store_name || cleanDomain, client_id, postex_token || '', instaworld_key || '', instaworld_key_backup || '');
  } else {
    db.prepare(`
      UPDATE stores SET shopify_client_id=?, postex_token=?, instaworld_key=?, instaworld_key_backup=?, store_name=?
      WHERE shop_domain=?
    `).run(client_id, postex_token || '', instaworld_key || '', instaworld_key_backup || '', store_name || cleanDomain, cleanDomain);
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

module.exports = router;
