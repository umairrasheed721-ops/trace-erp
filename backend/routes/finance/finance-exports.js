const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../auth');
const asyncHandler = require('../../middleware/async');
const FinanceAggregator = require('../../services/finance-aggregator');

// GET /api/finance/returns/export-csv
router.get('/returns/export-csv', authenticateToken, asyncHandler(async (req, res) => {
  const { store_id, days = 30 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const logs = await FinanceAggregator.getReturnsExportData(store_id, days);

    const headers = ['Date', 'Order Ref', 'Shopify ID', 'Customer', 'Tracking', 'Courier', 'Verified By', 'Restocked'];
    const rows = logs.map(l => [
      l.verified_at,
      l.ref_number,
      l.shopify_order_id,
      l.customer_name,
      l.tracking_number,
      l.courier,
      l.processed_by,
      l.restocked
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=returns_audit_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

module.exports = router;
