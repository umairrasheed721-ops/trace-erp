const db = require('../db');
const { getShopifyOrderStatus } = require('../engines/shopify_finance');

class FinanceService {
  static getCouriers(storeId) {
    if (!storeId) {
      const error = new Error('store_id required');
      error.status = 400;
      throw error;
    }
    const couriers = db.prepare("SELECT DISTINCT courier FROM orders WHERE store_id = ? AND courier IS NOT NULL AND courier != ''").all(Number(storeId));
    return couriers.map(c => c.courier);
  }

  static async repairLegacy({ store_id, courier, daysOld, forceUnpaidAsReturned }) {
    if (!store_id) {
      const error = new Error('store_id required');
      error.status = 400;
      throw error;
    }
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) {
      const error = new Error('Store not found');
      error.status = 404;
      throw error;
    }

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - (parseInt(daysOld) || 30));
    const dateStr = dateLimit.toISOString().split('T')[0];

    let query = `
      SELECT id, shopify_order_id, delivery_status, payment_status 
      FROM orders 
      WHERE store_id = ? 
      AND order_date <= ? 
      AND delivery_status NOT IN ('Delivered', 'Cancelled', 'Returned', 'Return Received', 'RTO')
    `;
    const params = [Number(store_id), dateStr];

    if (courier && courier !== 'All Inactive') {
      query += " AND courier = ?";
      params.push(courier);
    }

    const orders = db.prepare(query).all(...params);
    if (orders.length === 0) {
      return { count: 0, totalChecked: 0, message: 'No legacy orders found matching criteria.' };
    }
    
    let healedCount = 0;
    for (const order of orders) {
      try {
        const status = await getShopifyOrderStatus(store, order.shopify_order_id);
        
        let newDelivery = order.delivery_status;
        let newPayment = order.payment_status;

        if (status.is_cancelled) {
          newDelivery = 'Cancelled';
        } else if (status.financial_status === 'refunded' || status.tags?.toLowerCase().includes('returned')) {
          newDelivery = 'Returned';
        } else if (status.financial_status === 'paid') {
          newDelivery = 'Delivered';
          newPayment = 'Paid';
        } else if (forceUnpaidAsReturned) {
          newDelivery = 'Returned';
        }

        if (newDelivery !== order.delivery_status || newPayment !== order.payment_status) {
          db.prepare('UPDATE orders SET delivery_status = ?, payment_status = ? WHERE id = ?').run(newDelivery, newPayment, order.id);
          healedCount++;
        }
      } catch (e) {
        console.error(`Repair failed for ${order.shopify_order_id}:`, e.message);
      }
    }

    return { count: healedCount, totalChecked: orders.length };
  }
}

module.exports = FinanceService;
