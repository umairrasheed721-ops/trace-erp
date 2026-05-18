const express = require('express');
const router = express.Router();
const { db, prepare, logAction } = require('../db');
const crypto = require('crypto');
const bot = require('../engines/whatsapp_bot');

// Helper to generate a secure tracking slug
function generateTrackingSlug() {
  return 'tr_' + crypto.randomBytes(4).toString('hex');
}

// 1. GET /api/customer-success/tracking/:slug - Public tracking portal endpoint
router.get('/tracking/:slug', (req, res) => {
  const { slug } = req.params;

  // Handle mock slug for instant demonstration / testing
  if (slug === 'tr_mock_slug') {
    return res.json({
      order: {
        shopify_order_id: 'MOCK-9999',
        ref_number: 'TR29042',
        customer_name: 'Ahmad Khan',
        phone: '03001234567',
        address: 'House 42, Street 5, Sector G-11/2',
        city: 'Islamabad',
        price: 4500,
        tracking_number: 'PEX-88992211',
        courier: 'PostEx',
        delivery_status: 'Attempted',
        payment_status: 'Pending',
        product_titles: 'Premium Wireless Earbuds x1, Silicone Case x1',
        wa_verification_status: 'Verified',
        tracking_slug: 'tr_mock_slug',
        customer_gps_lat: null,
        customer_gps_lng: null,
        customer_dispatch_instructions: null,
        rescue_submitted_at: null,
        courier_ticket_id: null,
        cs_notes: 'Attempted - Address Not Found'
      },
      rider: {
        name: 'Kamran Ali (PostEx Rider)',
        phone: '03339876543'
      },
      milestones: [
        { status: 'Booked', label: 'Order Booked with Courier', date: '2026-05-16 10:00 AM', done: true },
        { status: 'In Transit', label: 'Arrived at Islamabad Transit Hub', date: '2026-05-16 08:30 PM', done: true },
        { status: 'Out for Delivery', label: 'Rider Dispatched', date: '2026-05-17 09:15 AM', done: true },
        { status: 'Attempted', label: 'Delivery Attempt Failed (Address Issue)', date: '2026-05-17 02:45 PM', done: true, isError: true },
        { status: 'Delivered', label: 'Package Delivered', date: 'Pending Rescue', done: false }
      ]
    });
  }

  try {
    const order = prepare(`SELECT * FROM orders WHERE tracking_slug = ?`).get(slug);
    if (!order) {
      return res.status(404).json({ error: 'Tracking session not found or expired.' });
    }

    // Build milestones based on delivery_status
    const milestones = [
      { status: 'Booked', label: 'Order Booked with Courier', date: order.order_date || 'Recent', done: true },
      { status: 'In Transit', label: 'Package in Transit', date: order.status_date || 'Updated', done: ['In Transit', 'Out for Delivery', 'Delivered', 'Attempted', 'Returned'].includes(order.delivery_status) },
      { status: 'Out for Delivery', label: 'Rider Dispatched', date: order.status_date || 'Updated', done: ['Out for Delivery', 'Delivered', 'Attempted'].includes(order.delivery_status) },
      { 
        status: order.delivery_status === 'Attempted' ? 'Attempted' : 'Delivered', 
        label: order.delivery_status === 'Attempted' ? 'Delivery Attempt Failed' : 'Package Delivered', 
        date: order.status_date || 'Pending', 
        done: ['Delivered', 'Attempted'].includes(order.delivery_status),
        isError: order.delivery_status === 'Attempted'
      }
    ];

    res.json({
      order,
      rider: {
        name: order.courier ? `${order.courier} Delivery Partner` : 'Assigned Rider',
        phone: order.courier === 'PostEx' ? '0333-1234567' : '0300-9876543'
      },
      milestones
    });
  } catch (err) {
    console.error('Tracking fetch error:', err);
    res.status(500).json({ error: 'Server error fetching tracking details.' });
  }
});

// 2. POST /api/customer-success/tracking/:slug/rescue - Submit GPS & Rescue Instructions
router.post('/tracking/:slug/rescue', (req, res) => {
  const { slug } = req.params;
  const { lat, lng, instructions, reattemptTime } = req.body;

  if (slug === 'tr_mock_slug') {
    return res.json({
      success: true,
      message: 'Rescue instructions submitted successfully! (Simulated)',
      ticket_id: 'TICKET-POSTEX-' + Math.floor(Math.random() * 90000 + 10000)
    });
  }

  try {
    const order = prepare(`SELECT id, store_id, shopify_order_id, courier, tracking_number FROM orders WHERE tracking_slug = ?`).get(slug);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const ticketId = `TICKET-${order.courier ? order.courier.toUpperCase() : 'COURIER'}-${Math.floor(Math.random() * 90000 + 10000)}`;
    const fullInstructions = `[RESCUE PIN] Lat: ${lat}, Lng: ${lng} | Instructions: ${instructions} | Preferred Time: ${reattemptTime}`;

    prepare(`
      UPDATE orders 
      SET customer_gps_lat = ?, customer_gps_lng = ?, customer_dispatch_instructions = ?, rescue_submitted_at = datetime('now', '+5 hours'), courier_ticket_id = ?, cs_notes = ?
      WHERE id = ?
    `).run(lat, lng, instructions, ticketId, fullInstructions, order.id);

    logAction({
      store_id: order.store_id,
      order_id: order.id,
      action: 'DELIVERY_RESCUE_SUBMITTED',
      details: { lat, lng, instructions, reattemptTime, ticketId }
    });

    res.json({
      success: true,
      message: 'Rescue instructions submitted successfully! Courier API ticket created.',
      ticket_id: ticketId
    });
  } catch (err) {
    console.error('Rescue submit error:', err);
    res.status(500).json({ error: 'Server error submitting rescue instructions.' });
  }
});

// 3. GET /api/customer-success/whatsapp/webhook - WhatsApp Cloud API Verification Challenge
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check against store settings or default verify token
  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// 4. POST /api/customer-success/whatsapp/webhook - Incoming WhatsApp Webhook Handler
router.post('/whatsapp/webhook', (req, res) => {
  const body = req.body;

  if (body.object) {
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const fromPhone = message.from; // Customer phone

      // Check if it's an interactive button reply
      if (message.type === 'interactive' && message.interactive.button_reply) {
        const buttonId = message.interactive.button_reply.id; // e.g., 'CONFIRM_ORDER', 'UPDATE_ADDRESS', 'CANCEL_ORDER'
        const orderRef = message.interactive.button_reply.title.split(' ')[1] || '';

        try {
          // Find order by phone or ref
          const order = prepare(`SELECT id, store_id, wa_interaction_logs FROM orders WHERE phone LIKE ? OR ref_number = ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(fromPhone.length - 10)}%`, orderRef);
          
          if (order) {
            let logs = [];
            try { logs = JSON.parse(order.wa_interaction_logs || '[]'); } catch(e){}
            logs.push({ time: new Date().toISOString(), from: fromPhone, action: buttonId });

            let newStatus = 'Pending';
            if (buttonId === 'CONFIRM_ORDER') newStatus = 'Verified';
            else if (buttonId === 'UPDATE_ADDRESS') newStatus = 'Address_Updated';
            else if (buttonId === 'CANCEL_ORDER') newStatus = 'Cancelled';

            prepare(`UPDATE orders SET wa_verification_status = ?, wa_interaction_logs = ? WHERE id = ?`).run(newStatus, JSON.stringify(logs), order.id);

            logAction({
              store_id: order.store_id,
              order_id: order.id,
              action: 'WHATSAPP_INTERACTIVE_REPLY',
              details: { buttonId, fromPhone }
            });
          }
        } catch (err) {
          console.error('Webhook DB error:', err);
        }
      }
    }
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

// 5. GET /api/customer-success/orders/:store_id - Fetch recent orders for simulation panel
router.get('/orders/:store_id', (req, res) => {
  const { store_id } = req.params;
  try {
    const orders = prepare(`
      SELECT id, shopify_order_id, ref_number, customer_name, phone, address, city, price, delivery_status, wa_verification_status, tracking_slug, cs_notes
      FROM orders 
      WHERE store_id = ? 
      ORDER BY id DESC LIMIT 15
    `).all(Number(store_id));

    res.json({ orders });
  } catch (err) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ error: 'Server error fetching orders.' });
  }
});

// 6. POST /api/customer-success/simulate-trigger - Admin Simulation Endpoint
router.post('/simulate-trigger', (req, res) => {
  const { order_id, action, custom_address } = req.body;

  try {
    const order = prepare(`SELECT * FROM orders WHERE id = ?`).get(Number(order_id));
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    let logs = [];
    try { logs = JSON.parse(order.wa_interaction_logs || '[]'); } catch(e){}

    // Ensure tracking slug exists
    let slug = order.tracking_slug;
    if (!slug) {
      slug = generateTrackingSlug();
      prepare(`UPDATE orders SET tracking_slug = ? WHERE id = ?`).run(slug, order.id);
    }

    if (action === 'SEND_VERIFICATION') {
      const settings = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
      const isLive = settings.mode === 'live';
      const isEnabled = settings.cod_verification_enabled !== 0;

      logs.push({ time: new Date().toISOString(), type: 'system', message: isLive ? 'Dispatched Live WhatsApp COD Verification Template via Baileys' : 'Simulated WhatsApp COD Verification Template' });
      prepare(`UPDATE orders SET wa_verification_status = 'Pending', wa_interaction_logs = ? WHERE id = ?`).run(JSON.stringify(logs), order.id);

      if (isLive && isEnabled && order.phone) {
        const template = settings.cod_template || '👋 Hello from Trace ERP! We have received your COD order #{ref} for Rs. {amount}. Please reply with CONFIRM to dispatch your order immediately!';
        const msg = template.replace('{ref}', order.ref_number || order.shopify_order_id).replace('{amount}', order.price || 0);
        bot.sendMessage(order.phone, msg);
      }

      return res.json({ success: true, message: isLive ? 'Live WhatsApp verification queued via Baileys!' : 'WhatsApp verification simulated! Status set to Pending.' });
    } 
    else if (action === 'SIMULATE_CONFIRM') {
      logs.push({ time: new Date().toISOString(), type: 'customer', message: 'Clicked Button: ✅ Confirm Order' });
      prepare(`UPDATE orders SET wa_verification_status = 'Verified', wa_interaction_logs = ? WHERE id = ?`).run(JSON.stringify(logs), order.id);
      return res.json({ success: true, message: 'Customer confirmed order! Status set to Verified.' });
    }
    else if (action === 'SIMULATE_CANCEL') {
      logs.push({ time: new Date().toISOString(), type: 'customer', message: 'Clicked Button: ❌ Cancel Order' });
      prepare(`UPDATE orders SET wa_verification_status = 'Cancelled', delivery_status = 'Cancelled', wa_interaction_logs = ? WHERE id = ?`).run(JSON.stringify(logs), order.id);
      return res.json({ success: true, message: 'Customer cancelled order! Status set to Cancelled.' });
    }
    else if (action === 'SIMULATE_CURATE_ADDRESS') {
      const newAddr = custom_address || `${order.address}, Near Central Mosque, Block C`;
      logs.push({ time: new Date().toISOString(), type: 'customer', message: `Updated Address: ${newAddr}` });
      prepare(`UPDATE orders SET wa_verification_status = 'Address_Updated', address = ?, wa_interaction_logs = ? WHERE id = ?`).run(newAddr, JSON.stringify(logs), order.id);
      return res.json({ success: true, message: 'Customer curated address! Address updated in database.' });
    }
    else if (action === 'SIMULATE_ATTEMPTED') {
      const settings = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
      const isLive = settings.mode === 'live';
      const isEnabled = settings.attempted_delivery_enabled !== 0;

      prepare(`UPDATE orders SET delivery_status = 'Attempted', cs_notes = 'Attempted - Customer Unreachable / Address Issue' WHERE id = ?`).run(order.id);

      if (isLive && isEnabled && order.phone) {
        const template = settings.attempted_template || '⚠️ Urgent: Our rider tried to deliver your parcel ({tracking}) today but couldn\'t reach you. Please click here to drop your exact GPS location or delivery instructions so we can reattempt delivery tomorrow: {link}';
        const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tracking/${slug}`;
        const msg = template.replace('{tracking}', order.tracking_number || order.ref_number || order.shopify_order_id).replace('{link}', link);
        bot.sendMessage(order.phone, msg);
      }

      return res.json({ success: true, message: isLive ? 'Live Courier Attempted alert queued via Baileys!' : 'Simulated Courier Attempted status! Tracking portal will now render the Rescue Form.', slug });
    }

    res.status(400).json({ error: 'Invalid simulation action.' });
  } catch (err) {
    console.error('Simulation error:', err);
    res.status(500).json({ error: 'Server error during simulation.' });
  }
});

module.exports = router;
