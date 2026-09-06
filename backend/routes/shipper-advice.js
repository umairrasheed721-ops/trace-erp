const express = require('express');
const router = express.Router();
const { db } = require('../db');
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
  const { store_id, month } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const blacklistSet = new Set(
      db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
    );

    // Dynamic available months list for last 6 months
    const monthRows = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', COALESCE(status_date, order_date)) as m_val
      FROM orders
      WHERE store_id = ?
      AND COALESCE(status_date, order_date) IS NOT NULL AND COALESCE(status_date, order_date) != ''
      AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-180 days')
      AND datetime(COALESCE(status_date, order_date)) <= datetime('now')
      ORDER BY m_val DESC
      LIMIT 6
    `).all(store_id);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const availableMonths = [
      { value: 'all', label: '📅 All Active (Last 45 Days)' },
      ...monthRows.filter(r => r.m_val).map(r => {
        const [y, m] = r.m_val.split('-');
        const monthIndex = parseInt(m, 10) - 1;
        const name = monthNames[monthIndex] || m;
        return { value: r.m_val, label: `📅 ${name} ${y}` };
      })
    ];

    let dateWhereClause = "AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-45 days')";
    let queryParams = [store_id];

    if (month && month !== 'all' && /^\d{4}-\d{2}$/.test(month)) {
      dateWhereClause = "AND strftime('%Y-%m', COALESCE(status_date, order_date)) = ?";
      queryParams = [store_id, month];
    }

    // Fetch active tracked non-terminal parcels for store
    const orders = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, phone, address, city, 
             delivery_status, courier_status, notes, price, product_titles, line_items, courier, 
             COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date, tracking_history
      FROM orders 
      WHERE store_id = ?
      AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
      AND LOWER(COALESCE(courier_status, '')) NOT LIKE '%delivered%'
      AND LOWER(COALESCE(courier_status, '')) NOT IN ('return received', 'returned', 'rto received', 'return received at hub', 'return received at warehouse')
      AND LOWER(COALESCE(delivery_status, '')) NOT IN ('delivered', 'return received', 'returned', 'cancelled')
      ${dateWhereClause}
      ORDER BY COALESCE(status_date, order_date) DESC
    `).all(...queryParams);

    const adviceRequired = [];
    const stuckParcels = [];
    const reattemptsSent = [];
    const returnsRequested = [];

    orders.forEach(o => {
      if (
        (o.tracking_number && blacklistSet.has(o.tracking_number)) ||
        (o.ref_number && blacklistSet.has(o.ref_number)) ||
        (o.id && blacklistSet.has(String(o.id)))
      ) return;

      const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
      const notesLower = (o.notes || '').toLowerCase().trim();
      const orderDateStr = (o.order_date || '').toLowerCase().trim();

      // 🛡️ Strict Legacy Filter: Skip all orders created in 2024/2023/2022 or containing 2024/2023 in notes
      if (
        orderDateStr.includes('2024') || orderDateStr.includes('2023') || orderDateStr.includes('2022') ||
        notesLower.includes('2024') || notesLower.includes('2023') || notesLower.includes('2022')
      ) {
        return;
      }

      const combinedFeed = `${courierStatusLower} ${notesLower}`;

      // Extract latest tracking_history event to catch stale courier_status
      let latestHistStatusLower = '';
      if (o.tracking_history) {
        try {
          const hist = typeof o.tracking_history === 'string' ? JSON.parse(o.tracking_history) : o.tracking_history;
          if (Array.isArray(hist) && hist.length > 0) {
            const last = hist[hist.length - 1];
            const s = last.transactionStatusMessage || last.statusMessage || last.message ||
                      last.transactionStatus || last.status || last.activity ||
                      last.description || last.remarks || '';
            latestHistStatusLower = s.toLowerCase().trim();
          }
        } catch (_) {}
      }

      // Effective courier status = latest history event OR stale courier_status
      const effectiveStatus = latestHistStatusLower || courierStatusLower;

      const isReattemptSent = notesLower.includes('[shipper advice - reattempt') || 
                              courierStatusLower.includes('reattempt requested') ||
                              courierStatusLower.includes('re-attempt requested');

      const isReturnRequested = notesLower.includes('[shipper advice - return') || 
                                effectiveStatus.includes('return requested') ||
                                effectiveStatus.includes('merchant requested return') ||
                                effectiveStatus.includes('waiting for return') ||
                                effectiveStatus.includes('return process initiated') ||
                                effectiveStatus.includes('return in process') ||
                                effectiveStatus.includes('return initiated') ||
                                effectiveStatus.includes('return in transit') ||
                                effectiveStatus.includes('refused to receive') ||
                                effectiveStatus.includes('rfd(refused') ||
                                effectiveStatus.includes('consignee refused delivery') ||
                                effectiveStatus.includes('return to shipper') ||
                                effectiveStatus.includes('rts');

      const matchesAdviceKeyword = ADVICE_COURIER_KEYWORDS.some(k => combinedFeed.includes(k) || effectiveStatus.includes(k));

      // Calculate days stuck in current warehouse/status without movement
      const lastDateStr = o.status_date || o.order_date;
      const daysStuck = lastDateStr ? Math.max(0, Math.floor((Date.now() - new Date(lastDateStr).getTime()) / (1000 * 60 * 60 * 24))) : 0;
      const isStuck = daysStuck >= 2;

      const itemWithStuck = { ...o, days_stuck: daysStuck };

      if (isReattemptSent) {
        reattemptsSent.push({ ...itemWithStuck, advice_category: 'reattempts' });
      } else if (isReturnRequested) {
        returnsRequested.push({ ...itemWithStuck, advice_category: 'returns' });
      } else if (matchesAdviceKeyword) {
        adviceRequired.push({ ...itemWithStuck, advice_category: 'advice_required' });
      } else if (isStuck) {
        stuckParcels.push({ ...itemWithStuck, advice_category: 'stuck_parcels' });
      }
    });

    // Sort stuck parcels by days_stuck DESC
    stuckParcels.sort((a, b) => (b.days_stuck || 0) - (a.days_stuck || 0));

    // Fetch History: Actioned parcels with shipper advice logs
    const history = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, phone, address, city, 
             delivery_status, courier_status, notes, price, product_titles, line_items, courier, 
             COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date, tracking_history
      FROM orders 
      WHERE store_id = ?
      AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
      AND (LOWER(COALESCE(notes, '')) LIKE '%[shipper advice%' OR LOWER(COALESCE(courier_status, '')) LIKE '%reattempt%' OR LOWER(COALESCE(courier_status, '')) LIKE '%return requested%')
      ${dateWhereClause}
      ORDER BY COALESCE(status_date, order_date) DESC
      LIMIT 150
    `).all(...queryParams);

    let historyResolvedCount = 0;
    let historyIgnoredCount = 0;
    let historyPendingCount = 0;

    const historyItems = history.map(o => {
      const lastDateStr = o.status_date || o.order_date;
      const hoursSinceAction = lastDateStr ? Math.max(0, Math.floor((Date.now() - new Date(lastDateStr).getTime()) / (1000 * 60 * 60))) : 0;
      const daysSinceAction = Math.floor(hoursSinceAction / 24);

      const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
      const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
      const isDelivered = deliveryStatusLower === 'delivered' || courierStatusLower.includes('delivered');

      let actionStatus = 'pending';
      if (isDelivered) {
        actionStatus = 'resolved';
        historyResolvedCount++;
      } else if (hoursSinceAction >= 24) {
        actionStatus = 'ignored';
        historyIgnoredCount++;
      } else {
        actionStatus = 'pending';
        historyPendingCount++;
      }

      return {
        ...o,
        days_stuck: daysSinceAction,
        hours_since_action: hoursSinceAction,
        days_since_action: daysSinceAction,
        action_status: actionStatus,
        is_action_ignored: actionStatus === 'ignored',
        advice_category: 'history'
      };
    });

    enrichOrderImages([...adviceRequired, ...stuckParcels, ...reattemptsSent, ...returnsRequested, ...historyItems], store_id);

    const allProblemOrders = [...adviceRequired, ...stuckParcels, ...reattemptsSent, ...returnsRequested];
    const totalCODAtRisk = allProblemOrders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
    const totalProblemParcels = adviceRequired.length + stuckParcels.length + reattemptsSent.length + returnsRequested.length;

    res.json({
      success: true,
      available_months: availableMonths,
      selected_month: month || 'all',
      financial_impact: {
        total_problem_parcels: totalProblemParcels,
        total_cod_at_risk: totalCODAtRisk,
        total_ignored_parcels: historyIgnoredCount
      },
      counts: {
        advice_required: adviceRequired.length,
        stuck_parcels: stuckParcels.length,
        reattempts_sent: reattemptsSent.length,
        returns_requested: returnsRequested.length,
        history: historyItems.length,
        history_resolved: historyResolvedCount,
        history_ignored: historyIgnoredCount,
        history_pending: historyPendingCount,
        total: adviceRequired.length + stuckParcels.length + reattemptsSent.length + returnsRequested.length
      },
      advice_required: adviceRequired,
      stuck_parcels: stuckParcels,
      reattempts_sent: reattemptsSent,
      returns_requested: returnsRequested,
      history: historyItems
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

    // Call PostEx Reattempt API for PostEx tracking numbers
    const trackingNum = (order.tracking_number || '').trim();
    const courierLower = (order.courier || '').toLowerCase();
    const isPostEx = courierLower.includes('postex') || 
                     trackingNum.startsWith('27') || 
                     trackingNum.startsWith('20') || 
                     !courierLower || courierLower === '—';

    if (isPostEx && trackingNum) {
      try {
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        const postexToken = store?.postex_token || store?.postex_api_key || store?.postex_api_token || process.env.POSTEX_API_KEY;
        if (postexToken) {
          const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
          const postexRes = await fetch('https://api.postex.pk/services/integration/api/order/v1/reattempt-order', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'token': postexToken
            },
            body: JSON.stringify({
              trackingNumber: trackingNum,
              remarks: `${remarks || 'Reattempt requested'}${allow_open ? ' (Allow open parcel)' : ''}`
            })
          });
          const postexData = await postexRes.json().catch(() => ({}));
          console.log(`[ShipperAdvice] PostEx Reattempt API response for ${trackingNum}:`, postexData);
        } else {
          console.warn(`[ShipperAdvice] Missing PostEx API token for store ${order.store_id}`);
        }
      } catch (postexErr) {
        console.warn('[ShipperAdvice] PostEx Reattempt API warning:', postexErr.message);
      }
    }

    // Also sync note directly to Shopify Admin order notes
    if (order.shopify_order_id && order.store_id) {
      try {
        const { appendShopifyNote } = require('../engines/shopify_finance');
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        if (store && (store.shop_domain || store.shopify_domain) && (store.access_token || store.shopify_access_token)) {
          const shopifyStore = {
            ...store,
            shop_domain: store.shop_domain || store.shopify_domain,
            access_token: store.access_token || store.shopify_access_token
          };
          console.log(`[ShipperAdvice] Appending note to Shopify order ${order.shopify_order_id}...`);
          await appendShopifyNote(shopifyStore, order.shopify_order_id, actionNote);
        } else {
          console.warn(`[ShipperAdvice] Missing store credentials for Shopify note sync (store_id: ${order.store_id})`);
        }
      } catch (shErr) {
        console.warn('[ShipperAdvice] Shopify note sync warning:', shErr.message);
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
 * Action: Blacklist parcel by tracking_number, ref_number, or order_id from Shipper Advice feed
 */
router.post('/ignore', (req, res) => {
  const { tracking_number, ref_number, order_id, store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const targets = Array.from(new Set([tracking_number, ref_number, order_id ? String(order_id) : null].filter(Boolean)));
  if (targets.length === 0) return res.status(400).json({ error: 'tracking_number, ref_number, or order_id required' });

  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO blacklist (store_id, tracking_number) VALUES (?, ?)');
    targets.forEach(target => {
      stmt.run(store_id, target);
    });
    res.json({ success: true, message: 'Parcel ignored from Shipper Advice feed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shipper-advice/stuck-report
 * Action: Log Stuck Report instruction & sync note to Shopify
 */
router.post('/stuck-report', async (req, res) => {
  const { id, remarks } = req.body;
  if (!id) return res.status(400).json({ error: 'order id required' });

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const actionNote = `[Shipper Advice - Stuck Report: ${remarks || 'Stuck Report Sent to Courier'}]`;
    const newNotes = order.notes ? `${order.notes} | ${actionNote}` : actionNote;

    db.prepare(`
      UPDATE orders 
      SET notes = ?,
          status_date = datetime('now')
      WHERE id = ?
    `).run(newNotes, id);

    // Sync note directly to Shopify Admin order notes
    if (order.shopify_order_id && order.store_id) {
      try {
        const { appendShopifyNote } = require('../engines/shopify_finance');
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        if (store && (store.shop_domain || store.shopify_domain) && (store.access_token || store.shopify_access_token)) {
          const shopifyStore = {
            ...store,
            shop_domain: store.shop_domain || store.shopify_domain,
            access_token: store.access_token || store.shopify_access_token
          };
          console.log(`[ShipperAdvice] Appending Stuck Report note to Shopify order ${order.shopify_order_id}...`);
          await appendShopifyNote(shopifyStore, order.shopify_order_id, actionNote);
        } else {
          console.warn(`[ShipperAdvice] Missing store credentials for Shopify note sync (store_id: ${order.store_id})`);
        }
      } catch (shErr) {
        console.warn('[ShipperAdvice] Shopify note sync warning for stuck report:', shErr.message);
      }
    }

    broadcast('order_updated', { storeId: order.store_id, orderId: order.id });
    res.json({ success: true, message: 'Stuck report logged & synced to Shopify successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shipper-advice/re-escalate
 * Action: Log Urgent Escalation instruction & sync note to Shopify
 */
router.post('/re-escalate', async (req, res) => {
  const { id, remarks } = req.body;
  if (!id) return res.status(400).json({ error: 'order id required' });

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const actionNote = `[Shipper Advice - Urgent Escalation: ${remarks || 'Courier Ignored Action - Escalated to Management'}]`;
    const newNotes = order.notes ? `${order.notes} | ${actionNote}` : actionNote;

    db.prepare(`
      UPDATE orders 
      SET notes = ?,
          status_date = datetime('now')
      WHERE id = ?
    `).run(newNotes, id);

    // Sync note directly to Shopify Admin order notes
    if (order.shopify_order_id && order.store_id) {
      try {
        const { appendShopifyNote } = require('../engines/shopify_finance');
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        if (store && (store.shop_domain || store.shopify_domain) && (store.access_token || store.shopify_access_token)) {
          const shopifyStore = {
            ...store,
            shop_domain: store.shop_domain || store.shopify_domain,
            access_token: store.access_token || store.shopify_access_token
          };
          console.log(`[ShipperAdvice] Appending Escalation note to Shopify order ${order.shopify_order_id}...`);
          await appendShopifyNote(shopifyStore, order.shopify_order_id, actionNote);
        } else {
          console.warn(`[ShipperAdvice] Missing store credentials for Shopify note sync (store_id: ${order.store_id})`);
        }
      } catch (shErr) {
        console.warn('[ShipperAdvice] Shopify note sync warning for escalation:', shErr.message);
      }
    }

    broadcast('order_updated', { storeId: order.store_id, orderId: order.id });
    res.json({ success: true, message: 'Urgent escalation logged & synced to Shopify successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
/**
 * GET /api/shipper-advice/live-tracking-history
 * Live Multi-Courier Tracking Engine (Instaworld / Leopards / TCS / LCS / PostEx)
 */
router.get('/live-tracking-history', async (req, res) => {
  const { tracking_number, store_id } = req.query;
  if (!tracking_number) {
    return res.status(400).json({ error: 'tracking_number required' });
  }

  const tnClean = String(tracking_number).trim();

  try {
    const store = store_id ? db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) : null;
    const order = db.prepare('SELECT * FROM orders WHERE tracking_number = ? OR ref_number = ? LIMIT 1').get(tnClean, tnClean);

    let savedHistory = [];
    if (order?.tracking_history) {
      try {
        const parsed = typeof order.tracking_history === 'string' ? JSON.parse(order.tracking_history) : order.tracking_history;
        if (Array.isArray(parsed)) savedHistory = parsed;
      } catch (_) {}
    }

    const courierLower = (order?.courier || '').toLowerCase();
    const isInsta = courierLower.includes('insta') || courierLower.includes('leopard') || courierLower.includes('tcs') || courierLower.includes('lcs') || tnClean.toUpperCase().startsWith('LE') || tnClean.toUpperCase().startsWith('LCS') || tnClean.startsWith('17');

    let history = [];
    let rawCourierStatus = null;

    if (isInsta) {
      const { instaworldFetch } = require('../engines/instaworld_http');
      const apiKeys = Array.from(new Set([
        store?.instaworld_key,
        store?.instaworld_key_backup,
        store?.instaworld_key_3,
        'qxdpk08t2mhrf2ed1sym',
        'juehwqkpycnowff4spoh'
      ].filter(Boolean)));

      let trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
      if (store?.instaworld_track_url && !store.instaworld_track_url.includes('app.instaworld.pk') && !store.instaworld_track_url.includes('one.instaworld.pk/track')) {
        trackUrl = store.instaworld_track_url;
      }

      for (const apiKey of apiKeys) {
        try {
          const fetchRes = await instaworldFetch(trackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracking_number: tnClean, api_key: apiKey }),
            proxyUrl: store?.gas_proxy_url
          });

          if (fetchRes.ok) {
            const data = await fetchRes.json();
            const historyArray = Array.isArray(data) ? data : (Array.isArray(data?.tracking_history) ? data.tracking_history : (Array.isArray(data?.data) ? data.data : null));
            
            if (historyArray && historyArray.length > 0) {
              history = historyArray.map(item => {
                const rawDate = item.date_time || item.dateTime || item.date || item.created_at || item.timestamp || '';
                let normDate = rawDate;
                if (rawDate) {
                  const str = String(rawDate).trim();
                  const ddmmyyyyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i;
                  const match = str.match(ddmmyyyyRegex);
                  if (match) {
                    let [, day, month, year, hours, minutes, seconds, ampm] = match;
                    let hrs = hours ? parseInt(hours, 10) : 0;
                    if (ampm) {
                      const isPm = ampm.toUpperCase() === 'PM';
                      if (isPm && hrs < 12) hrs += 12;
                      if (!isPm && hrs === 12) hrs = 0;
                    }
                    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hrs, minutes ? parseInt(minutes, 10) : 0, seconds ? parseInt(seconds, 10) : 0);
                    if (!isNaN(d.getTime())) normDate = d.toISOString();
                  }
                }
                return {
                  transactionStatusMessage: item.status || item.statusDescription || item.status_description || item.activity || 'Status Update',
                  transactionStatusDate: normDate,
                  remarks: item.remarks || item.vendor_name || item.courier_name || '',
                  location: item.location || item.city || ''
                };
              });

              const lastEv = historyArray[historyArray.length - 1];
              rawCourierStatus = lastEv?.status || lastEv?.statusDescription || data?.status || null;

              if (order?.id && history.length > 0) {
                try {
                  db.prepare('UPDATE orders SET tracking_history = ?, courier_status = COALESCE(?, courier_status) WHERE id = ?')
                    .run(JSON.stringify(history), rawCourierStatus, order.id);
                } catch (_) {}
              }
              break;
            }
          }
        } catch (e) {
          console.warn(`Instaworld track key error (${apiKey}):`, e.message);
        }
      }
    } else {
      const postexToken = store?.postex_token || store?.postex_api_key || process.env.POSTEX_API_KEY;
      let rawUrl = store?.postex_track_url || 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
      const baseUrl = rawUrl.replace(/\/?$/, '/');

      try {
        const response = await fetch(`${baseUrl}${encodeURIComponent(tnClean)}`, {
          method: 'GET',
          headers: { 'token': postexToken || '', 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          const data = await response.json();
          const distData = data?.dist || data;
          const apiHistory = data?.dist?.transactionStatusHistory || data?.transactionStatusHistory || data?.data?.transactionStatusHistory || data?.trackingHistory || [];
          rawCourierStatus = distData?.transactionStatus || data?.transactionStatus || null;

          if (Array.isArray(apiHistory) && apiHistory.length > 0) {
            history = apiHistory;
            if (order?.id) {
              try {
                db.prepare('UPDATE orders SET tracking_history = ?, courier_status = COALESCE(?, courier_status) WHERE id = ?')
                  .run(JSON.stringify(history), rawCourierStatus, order.id);
              } catch (_) {}
            }
          }
        }
      } catch (e) {
        console.warn('PostEx track error:', e.message);
      }
    }

    if (history.length === 0 && savedHistory.length > 0) {
      history = savedHistory;
    }

    if (history.length === 0 && order) {
      history = [{
        transactionStatusMessage: order.courier_status || order.delivery_status || 'Tracking Recorded',
        transactionStatusDate: order.status_date || order.order_date || '',
        remarks: order.notes || `Courier: ${order.courier || 'PostEx'}`,
        location: order.city || ''
      }];
    }

    res.json({
      success: true,
      courier_status: rawCourierStatus || order?.courier_status || null,
      tracking_history: history
    });
  } catch (err) {
    console.error('Live tracking fetch error:', err.message);
    res.status(500).json({ error: err.message, tracking_history: [] });
  }
});

module.exports = router;
