const db = require('../backend/db');

function healSelfDeliveries() {
  console.log('🩹 Starting retroactive self-delivery healing...');

  const orders = db.prepare(`
    SELECT id, tracking_number, courier 
    FROM orders 
    WHERE (courier IS NULL OR courier = '' OR courier = '—' OR courier = 'Unknown')
    AND tracking_number IS NOT NULL 
    AND tracking_number != '' 
    AND tracking_number != '—'
  `).all();

  console.log(`🔍 Scanning ${orders.length} orders for self-delivery patterns...`);

  const selfKeywords = ['hand', 'self', 'rider', 'local', 'office', 'pickup', 'personal'];
  const datePattern = /^(?:\d{1,4})[./-]\d{1,2}[./-](?:\d{1,4})$/;
  let updatedCount = 0;

  for (const order of orders) {
    const tracking = order.tracking_number.trim().toLowerCase();
    
    // Check keywords
    const isKeywordMatch = selfKeywords.some(kw => tracking.includes(kw));
    // Check date pattern
    const isDateMatch = datePattern.test(tracking);

    if (isKeywordMatch || isDateMatch) {
      db.prepare("UPDATE orders SET courier = 'Self Delivery' WHERE id = ?").run(order.id);
      updatedCount++;
    }
  }

  console.log(`✅ Retroactive healing complete. Updated ${updatedCount} orders to 'Self Delivery'.`);
}

healSelfDeliveries();
