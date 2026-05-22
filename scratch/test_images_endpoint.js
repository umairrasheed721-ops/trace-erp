const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbFile = path.join(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbFile);

console.log('Using SQLite DB via DatabaseSync:', dbFile);

// Let's find an order with line items
const order = db.prepare("SELECT id, phone, line_items FROM orders WHERE line_items IS NOT NULL AND line_items != '[]' LIMIT 1").get();

if (!order) {
  console.log('No order found with line items. Creating a dummy one.');
  // Create a dummy order
  db.prepare(`
    INSERT INTO orders (store_id, phone, customer_name, line_items, delivery_status, price, ref_number)
    VALUES (1, '923001234567', 'Test Customer', '[]', 'Pending', 1000, 'TR123')
  `).run();
  console.log('Dummy order created.');
} else {
  console.log('Found order:', order.id, 'Phone:', order.phone);
  try {
    const items = JSON.parse(order.line_items);
    console.log('Items in order:', items);
    
    // Add image url to one variant for testing
    if (items.length > 0) {
      items[0].image_url = 'https://cdn.shopify.com/s/files/1/0000/0000/files/test-image.jpg';
      items[0].title = 'Beautiful Silk Dress';
      items[0].quantity = 2;
      items[0].price = 1500;
      
      db.prepare('UPDATE orders SET line_items = ? WHERE id = ?').run(JSON.stringify(items), order.id);
      console.log('Updated order', order.id, 'with a dummy item image URL.');
    }
  } catch(e) {
    console.error('Failed to parse/update line items:', e.message);
  }
}

// Now let's test the endpoint logic:
const testOrderId = order ? order.id : 1;
const testOrder = db.prepare('SELECT id, store_id, phone, customer_name, line_items FROM orders WHERE id = ?').get(testOrderId);
console.log('Testing endpoint logic for order:', testOrder.id);

let cleaned = testOrder.phone.replace(/\D/g, '');
if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

let lineItems = [];
try {
  lineItems = typeof testOrder.line_items === 'string' ? JSON.parse(testOrder.line_items) : (testOrder.line_items || []);
} catch (e) {
  console.error('Failed to parse');
}

const itemsWithImages = lineItems.filter(item => item.image_url && item.image_url.trim() !== '');
console.log('Found', itemsWithImages.length, 'items with images.');

let mockBot = {
  sendMessage(phone, caption, isManual, imageUrl) {
    console.log('MOCK BOT: sendMessage called with:', { phone, caption, isManual, imageUrl });
  }
};

let sentCount = 0;
for (const item of itemsWithImages) {
  const caption = `🤖 [TRACE Support] Ordered item: *${item.title}*${item.variant_title ? ` (${item.variant_title})` : ''} — Qty: ${item.quantity}`;
  const dbMessageContent = `[Image: ${item.image_url}] ${caption}`;

  console.log('Saving message to SQLite:', dbMessageContent);
  
  // Insert into SQLite database using node:sqlite DatabaseSync syntax
  const stmt = db.prepare(`
    INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status)
    VALUES (?, ?, ?, 'outgoing', ?, 'sent')
  `);
  
  const info = stmt.run(testOrder.store_id, testOrder.id, cleaned, dbMessageContent);
  console.log('Inserted into whatsapp_messages. changes:', info.changes, 'lastInsertRowid:', info.lastInsertRowid);

  mockBot.sendMessage(cleaned, caption, true, item.image_url);
  sentCount++;

  // Clean up test message from database using the returned lastInsertRowid
  db.prepare('DELETE FROM whatsapp_messages WHERE id = ?').run(Number(info.lastInsertRowid));
  console.log('Cleaned up mock message ID:', Number(info.lastInsertRowid));
}

console.log('Verification finished! sentCount =', sentCount);
