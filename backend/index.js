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
const schedulerInit = require('./scheduler');

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
  if (req.path === '/health') return next();
  
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});
