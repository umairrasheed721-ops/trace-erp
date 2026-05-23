const db = require('../backend/db');

try {
  const store_id = 1;
  const limit = 250;
  const offset = 0;
  const where = 'o.store_id = ?';
  const queryParams = [store_id];

  const t0 = Date.now();
  const orders = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    WHERE ${where}
    ORDER BY o.created_timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...queryParams, limit, offset);
  const t1 = Date.now();

  console.log(`Fetch took: ${t1 - t0}ms`);
  console.log(`Number of orders fetched: ${orders.length}`);

  const jsonStr = JSON.stringify({ orders });
  const sizeInBytes = Buffer.byteLength(jsonStr, 'utf8');
  const sizeInKB = sizeInBytes / 1024;
  const sizeInMB = sizeInKB / 1024;

  console.log(`JSON Payload size: ${sizeInBytes} bytes (${sizeInKB.toFixed(2)} KB / ${sizeInMB.toFixed(2)} MB)`);

  // Let's also check sizes of individual columns, like line_items
  let totalLineItemsSize = 0;
  let maxLineItemsSize = 0;
  let maxLineItemsOrderId = null;
  orders.forEach(o => {
    const len = o.line_items ? Buffer.byteLength(o.line_items, 'utf8') : 0;
    totalLineItemsSize += len;
    if (len > maxLineItemsSize) {
      maxLineItemsSize = len;
      maxLineItemsOrderId = o.id;
    }
  });

  console.log(`Total line_items size: ${totalLineItemsSize} bytes (${(totalLineItemsSize / 1024).toFixed(2)} KB)`);
  console.log(`Max single line_items size: ${maxLineItemsSize} bytes on order ID: ${maxLineItemsOrderId}`);
} catch (e) {
  console.error('Error:', e);
}
