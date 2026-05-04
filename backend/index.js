require('dotenv').config();
const { sendEmergencyAlert } = require('./engines/alerts');

// --- 🛡️ GLOBAL CRASH PREVENTERS ---
process.on('uncaughtException', (err) => {
  console.error('🛑 CRITICAL: Uncaught Exception caught to prevent crash:', err.stack || err);
  sendEmergencyAlert(`*Uncaught Exception*\n${err.message}\nCheck logs at /api/admin/logs`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 CRITICAL: Unhandled Rejection caught to prevent crash:', reason);
  sendEmergencyAlert(`*Unhandled Rejection*\n${reason}\nCheck logs at /api/admin/logs`);
});

// --- 🛡️ ENVIRONMENT HEALTH GUARD ---
const REQUIRED_ENV = ['DB_PATH', 'JWT_SECRET']; 
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ CRITICAL STARTUP ERROR: Missing Environment Variables:');
  missing.forEach(m => console.error(`   - ${m}`));
  console.error('The server cannot start safely. Please check your Railway variables.\n');
  process.exit(1);
}
console.log('✅ Environment Health Check Passed.');

// --- 📊 LIVE PULSE LOG BUFFER ---
const LOG_BUFFER_SIZE = 200;
let logBuffer = [];
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logBuffer.push(`[${new Date().toISOString()}] INFO: ${msg}`);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logBuffer.push(`[${new Date().toISOString()}] ERROR: ${msg}`);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  originalError.apply(console, args);
};

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { router: authRoutes } = require('./routes/auth');
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
const templatesRoutes = require('./routes/templates');
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

// --- 📊 LIVE PULSE LOGS API ---
app.get('/api/admin/logs', authenticateToken, (req, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send(logBuffer.join('\n'));
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
app.use('/api/templates', templatesRoutes);

// --- 🚑 INDESTRUCTIBLE HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    wa_bot: bot.getStatus().status
  });
});

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

const server = app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});

// --- 🛑 GRACEFUL SHUTDOWN ---
const shutdown = () => {
  console.log('\n👋 Shutdown signal received. Closing server gracefully...');
  server.close(() => {
    console.log('✅ HTTP server closed.');
    try {
      db.exec('PRAGMA optimize;'); // Final DB optimization
      console.log('✅ Database optimized and closed.');
    } catch (e) {}
    process.exit(0);
  });

  // Force shutdown after 10s if graceful close fails
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcing shut down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
