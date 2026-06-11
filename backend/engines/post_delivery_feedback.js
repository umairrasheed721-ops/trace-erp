const { normalizePhone } = require('./whatsapp_message_processor');

async function checkAndSendPostDeliveryFeedback(activeDb, activeBot) {
  try {
    // 1. Get settings
    const settings = activeDb.prepare('SELECT enable_post_delivery_feedback, post_delivery_template FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.enable_post_delivery_feedback !== 1) {
      return; // Post-delivery feedback not enabled globally
    }

    const templateText = settings.post_delivery_template || `👋 Hi {first_name}! Kaisa laga aapko TracePK se received aapka parcel? 😍 Apne parcel ki picture ya video hamare sath share karein aur apne next order par payen FLAT 10% OFF! Discount Code: TRACE10 🎁✨`;

    // 2. Query whatsapp_polls for 'Trace: Delivered' entries created more than 24 hours ago
    const pendingFeedbacks = activeDb.prepare(`
      SELECT * FROM whatsapp_polls
      WHERE erp_status = 'Trace: Delivered'
        AND created_at < datetime('now', '-24 hours')
    `).all();

    console.log(`🕵️‍♂️ [POST_DELIVERY_FEEDBACK] Found ${pendingFeedbacks.length} orders eligible for post-delivery review requests.`);

    for (const feedback of pendingFeedbacks) {
      const { id, order_id, remote_jid } = feedback;
      if (!order_id) continue;

      let orderRow;
      try {
        orderRow = activeDb.prepare('SELECT id, price, ref_number, store_id, customer_name, phone FROM orders WHERE id = ?').get(order_id);
      } catch (orderErr) {
        console.error(`❌ [POST_DELIVERY_FEEDBACK] Failed to query order for ID ${order_id}:`, orderErr.message);
        continue;
      }

      if (!orderRow) {
        console.warn(`⚠️ [POST_DELIVERY_FEEDBACK] Order ID ${order_id} not found in DB for poll ID ${id}. Skipping.`);
        continue;
      }

      // Check phone number
      const phone = orderRow.phone || remote_jid.split('@')[0];
      if (!phone || phone === 'unknown') {
        console.warn(`⚠️ [POST_DELIVERY_FEEDBACK] Phone number missing for Order ID ${order_id}. Skipping.`);
        continue;
      }
      const normalizedPhone = normalizePhone(phone);

      const ref = orderRow.ref_number || `#${orderRow.id}`;
      const amount = orderRow.price !== undefined && orderRow.price !== null ? orderRow.price : 'N/A';
      const name = (orderRow.customer_name || 'Customer').split(' ')[0];

      let storeName = 'TracePK';
      try {
        const storeRow = activeDb.prepare('SELECT store_name FROM stores WHERE id = ?').get(orderRow.store_id);
        if (storeRow && storeRow.store_name) {
          storeName = storeRow.store_name;
        }
      } catch (_) {}

      const finalMessage = templateText
        .replace(/\{ref\}/gi, ref)
        .replace(/\{amount\}/gi, amount)
        .replace(/\{name\}/gi, name)
        .replace(/\{first_name\}/gi, name)
        .replace(/\{store_name\}/gi, storeName);

      console.log(`🚀 [POST_DELIVERY_FEEDBACK] Sending review request to ${normalizedPhone} for order ${ref}...`);

      try {
        await activeBot.directSendMessage(normalizedPhone, finalMessage, true, null, null, null, null, null, null, 'native', null, { force: true, orderId: order_id });
        console.log(`✅ [POST_DELIVERY_FEEDBACK] Feedback request sent to ${normalizedPhone}`);

        // Update erp_status to avoid double sending
        activeDb.prepare(`
          UPDATE whatsapp_polls
          SET erp_status = 'Trace: Feedback Sent', shopify_synced = 0
          WHERE id = ?
        `).run(id);

      } catch (sendErr) {
        console.error(`❌ [POST_DELIVERY_FEEDBACK] Failed to send feedback message to ${normalizedPhone}:`, sendErr.message);
        try {
          const { logSystemError } = require('../db');
          logSystemError('ERROR', `[Post Delivery Feedback] Failed to send to +${normalizedPhone}: ${sendErr.message}`, 'post_delivery_feedback');
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('❌ [POST_DELIVERY_FEEDBACK] Critical error in feedback processor:', err.message);
  }
}

module.exports = { checkAndSendPostDeliveryFeedback };
