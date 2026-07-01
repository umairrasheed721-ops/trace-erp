/**
 * 🎯 TRACE ERP: Stuck Parcel Sniper Engine
 * Scans for stuck parcels and auto-dispatches WhatsApp alerts via bot queue.
 * NEVER touches bot.sock directly — communicates ONLY through bot.sendMessage().
 */
const { db } = require('../db');
const bot = require('./whatsapp_bot');

const STUCK_STATUSES = [
  'Consignee Not Available',
  'Attempted Delivery',
  'Hold',
  'Address Issue',
  'RTO Initiated',
  'Return to Sender',
];

async function runSniperScan() {
  if (bot.getStatus().status !== 'CONNECTED') {
    console.log('🎯 Sniper: Bot not connected, skipping scan.');
    return;
  }

  try {
    const settings = db.prepare('SELECT stuck_threshold_hours FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    const thresholdHours = settings?.stuck_threshold_hours || 36;

    const stuckOrders = db.prepare(`
      SELECT o.id, o.phone, o.tracking_number, o.courier, o.delivery_status,
             o.customer_name, o.ref_number, o.status_date
      FROM orders o
      LEFT JOIN sniper_alerts s 
        ON s.order_id = o.id 
        AND s.alert_type = 'stuck_parcel'
        AND s.sent_at > datetime('now', '-48 hours')
      WHERE
        o.delivery_status IN (${STUCK_STATUSES.map(() => '?').join(',')})
        AND datetime(COALESCE(o.status_date, o.order_date)) < datetime('now', '-' || ? || ' hours')
        AND o.phone IS NOT NULL
        AND o.phone != ''
        AND s.id IS NULL
      ORDER BY o.id ASC
      LIMIT 25
    `).all(...STUCK_STATUSES, thresholdHours);

    if (stuckOrders.length === 0) {
      console.log('🎯 Sniper: No stuck parcels found this cycle.');
      return;
    }

    console.log(`🎯 Sniper: Found ${stuckOrders.length} stuck parcel(s) — dispatching alerts...`);

    for (const order of stuckOrders) {
      try {
        const name = order.customer_name ? order.customer_name.split(' ')[0] : 'Customer';
        const tracking = order.tracking_number || 'N/A';
        const courier = order.courier || 'Courier';
        const ref = order.ref_number || `#${order.id}`;
        const status = order.delivery_status || 'Not Available';

        const msg = `📦 *TRACE ERP Update*\n\nAssalam o Alaikum ${name} Sahab! 🙏\n\nAapka order *${ref}* deliver karne ki koshish ki gayi thi lekin *"${status}"* ki wajah se deliver nahi ho saka.\n\n📬 *Tracking:* ${tracking} (${courier})\n\nPlease apna *exact address* ya *ghar pe available time* share karein taakay rider dobara delivery attempt kar sake.\n\nYa aap directly rider se rabta karein — JazakAllah! 🤝`;

        // Log sniper alert BEFORE sending to prevent double-fire on race condition
        db.prepare(`
          INSERT INTO sniper_alerts (order_id, phone, alert_type, message_sent, delivery_status_at_send)
          VALUES (?, ?, 'stuck_parcel', ?, ?)
        `).run(order.id, order.phone, msg, order.delivery_status);

        // Dispatch via bot queue (isManual=false → anti-ban delay applies)
        bot.sendMessage(order.phone, msg, false);
        console.log(`🎯 Sniper: Alert queued for Order ${ref} → ${order.phone}`);
      } catch (orderErr) {
        console.error(`🎯 Sniper: Failed for order ${order.id}:`, orderErr.message);
      }
    }

    console.log(`🎯 Sniper: Cycle complete — ${stuckOrders.length} alert(s) queued.`);
  } catch (err) {
    console.error('🎯 Sniper scan error:', err.message);
  }
}

module.exports = { runSniperScan };
