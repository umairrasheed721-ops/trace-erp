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

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});
