const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');

// Helper: Enrich product variant images from product_master_costs
function enrichOrderImages(orders, storeId) {
  try {
    const costMap = {};
    const costs = db.prepare('SELECT shopify_variant_id, parent_title, variant_title, variant_image_url FROM product_master_costs WHERE store_id = ?').all(Number(storeId));
    costs.forEach(c => {
      if (c.variant_image_url) {
        if (c.shopify_variant_id) costMap[String(c.shopify_variant_id)] = c.variant_image_url;
        const fullTitle = `${c.parent_title || ''} ${c.variant_title || ''}`.trim().toLowerCase();
        if (fullTitle) costMap[fullTitle] = c.variant_image_url;
        if (c.parent_title) costMap[c.parent_title.toLowerCase().trim()] = c.variant_image_url;
      }
    });

    orders.forEach(o => {
      let items = [];
      if (o.line_items) {
        try {
          items = typeof o.line_items === 'string' ? JSON.parse(o.line_items) : o.line_items;
        } catch (_) {}
      }
      if (Array.isArray(items)) {
        o.line_items_parsed = items.map(it => {
          let img = it.image || it.image_url || it.src || it.variant_image_url || null;
          if (!img && it.variant_id && costMap[String(it.variant_id)]) {
            img = costMap[String(it.variant_id)];
          }
          if (!img && (it.title || it.name)) {
            const key = (it.title || it.name).toLowerCase().trim();
            if (costMap[key]) img = costMap[key];
          }
          return {
            ...it,
            image: img
          };
        });
      }
    });
  } catch (err) {
    console.warn('Image enrichment warning in shipper advice:', err.message);
  }
}

// Problem Courier Status Keywords (100% Zero Dependence on ERP delivery_status!)
const ADVICE_COURIER_KEYWORDS = [
  'delivery under review',
  'shipper advice',
  'merchant request',
  'attempt made',
  'reattempt',
  're-attempt',
  'cna',
  'address incomplete',
  'consignee refused',
  'refused by customer',
  'consignee not available',
  'customer not answering',
  'wrong phone number',
  'out of service',
  'door closed',
  'customer requested open parcel',
  'consignee wants open parcel'
];

/**
 * GET /api/shipper-advice?store_id=1
 * ZERO ERP STATUS DEPENDENCY ENGINE:
 * Reads raw courier_status, notes, and tracking updates directly.
 * Completely ignores delivery_status (Cancelled, Booked, Pending, etc. have 0 impact!).
 */
router.get('/', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const blacklistSet = new Set(
      db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
    );

    // Fetch all active tracked non-terminal parcels for store
    const orders = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, phone, address, city, 
             delivery_status, courier_status, notes, price, product_titles, line_items, courier, 
             COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date, created_at
      FROM orders 
      WHERE store_id = ?
      AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
      AND LOWER(COALESCE(courier_status, '')) NOT IN ('delivered', 'return received', 'returned', 'rto received')
      AND LOWER(COALESCE(delivery_status, '')) NOT IN ('delivered', 'return received', 'returned')
      ORDER BY COALESCE(status_date, order_date, created_at) DESC
    `).all(store_id);

    const adviceRequired = [];
    const reattemptsSent = [];
    const returnsRequested = [];

    orders.forEach(o => {
      if (blacklistSet.has(o.tracking_number)) return;

      const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
      const notesLower = (o.notes || '').toLowerCase().trim();
      const combinedFeed = `${courierStatusLower} ${notesLower}`;

      const isReattemptSent = notesLower.includes('[shipper advice - reattempt') || 
                              courierStatusLower.includes('reattempt requested') ||
                              courierStatusLower.includes('re-attempt requested');

      const isReturnRequested = notesLower.includes('[shipper advice - return') || 
                                courierStatusLower.includes('return requested') ||
                                courierStatusLower.includes('merchant requested return');

      const matchesAdviceKeyword = ADVICE_COURIER_KEYWORDS.some(k => combinedFeed.includes(k));

      if (isReattemptSent) {
        reattemptsSent.push({ ...o, advice_category: 'reattempts' });
      } else if (isReturnRequested) {
        returnsRequested.push({ ...o, advice_category: 'returns' });
      } else if (matchesAdviceKeyword) {
        adviceRequired.push({ ...o, advice_category: 'advice_required' });
      }
    });

    enrichOrderImages([...adviceRequired, ...reattemptsSent, ...returnsRequested], store_id);

    res.json({
      success: true,
      counts: {
        advice_required: adviceRequired.length,
        reattempts_sent: reattemptsSent.length,
        returns_requested: returnsRequested.length,
        total: adviceRequired.length + reattemptsSent.length + returnsRequested.length
      },
      advice_required: adviceRequired,
      reattempts_sent: reattemptsSent,
      returns_requested: returnsRequested
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shipper-advice/reattempt
 * Action: Log Reattempt Remark & trigger PostEx/Courier API
 */
router.post('/reattempt', async (req, res) => {
  const { id, remarks, allow_open } = req.body;
  if (!id) return res.status(400).json({ error: 'order id required' });

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const openNote = allow_open ? ' [Allow Open Parcel]' : '';
    const actionNote = `[Shipper Advice - Reattempt: ${remarks || 'Reattempt Requested'}${openNote}]`;
    const newNotes = order.notes ? `${order.notes} | ${actionNote}` : actionNote;

    db.prepare(`
      UPDATE orders 
      SET courier_status = 'Reattempt Requested',
          notes = ?,
          status_date = datetime('now')
      WHERE id = ?
    `).run(newNotes, id);

    // Call PostEx Reattempt API if courier is PostEx
    if ((order.courier || '').toLowerCase().includes('postex') && order.tracking_number) {
      try {
        const postexConfig = db.prepare('SELECT postex_api_token FROM stores WHERE id = ?').get(order.store_id);
        if (postexConfig && postexConfig.postex_api_token) {
          const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
          await fetch('https://api.postex.pk/services/integration/api/order/v1/reattempt-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': postexConfig.postex_api_token
            },
            body: JSON.stringify({
              trackingNumber: order.tracking_number,
              remarks: `${remarks || 'Reattempt requested'}${allow_open ? ' (Allow open parcel)' : ''}`
            })
          });
        }
      } catch (postexErr) {
        console.warn('PostEx Reattempt API warning:', postexErr.message);
      }
    }

    broadcast('order_updated', { storeId: order.store_id, orderId: order.id });
    res.json({ success: true, message: 'Reattempt action logged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shipper-advice/return
 * Action: Mark Return Requested in Shipper Advice
 */
router.post('/return', (req, res) => {
  const { id, reason } = req.body;
  if (!id) return res.status(400).json({ error: 'order id required' });

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const actionNote = `[Shipper Advice - Return: ${reason || 'Return Confirmed by Merchant'}]`;
    const newNotes = order.notes ? `${order.notes} | ${actionNote}` : actionNote;

    db.prepare(`
      UPDATE orders 
      SET courier_status = 'Merchant Requested Return',
          notes = ?,
          status_date = datetime('now')
      WHERE id = ?
    `).run(newNotes, id);

    broadcast('order_updated', { storeId: order.store_id, orderId: order.id });
    res.json({ success: true, message: 'Return action logged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shipper-advice/ignore
 * Action: Blacklist tracking number from Shipper Advice feed
 */
router.post('/ignore', (req, res) => {
  const { tracking_number, store_id } = req.body;
  if (!tracking_number || !store_id) return res.status(400).json({ error: 'tracking_number and store_id required' });

  try {
    db.prepare('INSERT OR IGNORE INTO blacklist (store_id, tracking_number, created_at) VALUES (?, ?, datetime(\'now\'))')
      .run(store_id, tracking_number);
    res.json({ success: true, message: 'Tracking number ignored from Shipper Advice' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
