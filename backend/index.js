require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const trackingRoutes = require('./routes/tracking');
const monitorsRoutes = require('./routes/monitors');
const watchdogRoutes = require('./routes/watchdog');
const storesRoutes = require('./routes/stores');
const financeRoutes = require('./routes/finance');
const reportsRoutes = require('./routes/reports');
const usersRoutes = require('./routes/users');
const webhooksRoutes = require('./routes/webhooks');
const whatsappRoutes = require('./routes/whatsapp');
const publicRoutes = require('./routes/public');
const schedulerInit = require('./scheduler');
const bot = require('./engines/whatsapp_bot'); // Start the bot

// Reset any stuck sync statuses on startup
try {
  db.prepare("UPDATE stores SET sync_status = 'idle', sync_progress = 'Ready' WHERE sync_status = 'syncing'").run();
  console.log('✅ All stuck sync statuses reset to idle');
} catch (e) {
  console.error('Failed to reset sync statuses:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';

// ─── Security: JWT Auth for API ───
app.use((req, res, next) => {
  // Public paths
  if (req.path.startsWith('/api/auth/callback')) return next();
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/webhooks/')) return next();
  if (req.path.startsWith('/api/public/')) return next();
  if (req.path === '/health') return next();
  
  // Live SSE Endpoint handles its own token from query
  if (req.path === '/api/live') {
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

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/monitors', monitorsRoutes);
app.use('/api/watchdog', watchdogRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/public', publicRoutes);

const { addClient } = require('./sse');

// Live Real-Time Events endpoint
app.get('/api/live', (req, res) => {
  addClient(req, res);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});
