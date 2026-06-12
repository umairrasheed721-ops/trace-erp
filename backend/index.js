require('dotenv').config();
const startup = require('./startup'); // 🚀 Early boot preventers & config overrides run here first

const path = require('path');
const express = require('express');
const cors = require('cors');
const { DB_DIR } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// ⚡ GZIP COMPRESSION — cuts API response sizes 60-80%
try {
  const compression = require('compression');
  app.use(compression({ level: 6, threshold: 1024 }));
  console.log('✅ Gzip compression enabled');
} catch (_) {
  console.warn('⚠️ compression module not found, running without gzip');
}

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

const responseWrapper = require('./middleware/response');
app.use(responseWrapper);

// --- 🛡️ MULTI-TENANT ISOLATION MIDDLEWARE ---
const tenantMiddleware = require('./middleware/tenant');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET missing');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Security: JWT Auth for API ───
app.use((req, res, next) => {
  // Public paths
  if (req.path.startsWith('/api/auth/callback')) return next();
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/webhooks/')) return next();
  if (req.path.startsWith('/api/public/')) return next();
  if (req.path === '/api/whatsapp-governance/webhook/whatsapp') return next();

  // Media Proxy Route handles token from query parameter or authorization header
  if (req.path.startsWith('/api/media/')) {
    const token = req.query.token || (req.headers.authorization ? (req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : req.headers.authorization) : '');
    if (!token) return res.status(401).json({ error: 'Authentication token required' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  if (req.path === '/health' || req.path === '/api/health') return next();
  if (req.path.includes('/api/diagnostics')) return next();
  if (req.path.includes('/api/users/permissions')) return next();
  if (req.path === '/api/wake-up-test' || req.originalUrl.includes('wake-up-test')) return next();
  if (req.path === '/api/fire-test' || req.originalUrl.includes('fire-test')) return next();
  if (req.path === '/api/system/storage-audit') return next();
  
  // Live SSE Endpoint handles its own token from query
  if (req.path === '/api/live' || req.path === '/api/sync/stream') {
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: 'Token missing' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  
  // Allow all non-API requests (static files, frontend routes)
  if (!req.path.startsWith('/api/')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authentication required' });

  const token = (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader) || '';
  if (!token) return res.status(401).json({ error: 'Token missing' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.use(tenantMiddleware);

// --- 🏪 STATIC MEDIA & UPLOADS ---
app.use('/uploads', express.static(path.join(DB_DIR, 'uploads')));

// --- 🔌 ROUTE REGISTRATIONS ---
app.use(require('./routes'));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// --- 🚑 ERROR HANDLER & STATIC CATCH-ALL ---
const errorHandler = require('./middleware/error');
app.use(errorHandler);

app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 🚀 START SERVER ---
const { initWebSocket } = require('./websocket');

const server = app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  startup.initPostListen(server); // Initialize post-listen cron, audit, and graceful shutdowns
});

initWebSocket(server);

const startShopifySyncJob = require('./services/shopifySyncJob');
startShopifySyncJob(); // Starts the background 15-min interval
