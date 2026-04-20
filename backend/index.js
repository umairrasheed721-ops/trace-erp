require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const trackingRoutes = require('./routes/tracking');
const monitorsRoutes = require('./routes/monitors');
const watchdogRoutes = require('./routes/watchdog');
const storesRoutes = require('./routes/stores');
const schedulerInit = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// ─── Security: Basic Auth for Production ───
app.use((req, res, next) => {
  // Allow Shopify to send OAuth callbacks
  if (req.path.startsWith('/api/auth/callback')) return next();
  // Allow health check for Railway
  if (req.path === '/health') return next();

  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  
  const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (login === 'admin' && password === correctPassword) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Secure Trace ERP"');
  res.status(401).send('Authentication required.');
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// DEBUG ROUTE
const debugRoutes = require('./routes/debug');
app.use('/api/debug', debugRoutes);

// FINANCE ROUTES
const financeRoutes = require('./routes/finance');
app.use('/api/finance', financeRoutes);

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});
