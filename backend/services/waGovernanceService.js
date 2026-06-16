/**
 * WhatsApp Governance Database Access Service
 * Decouples Express routes from direct SQLite database queries.
 * Injects proper JSDoc typings.
 */

const { db } = require('../db');

class WaGovernanceService {
  /**
   * Fetches an order record by its ID and tenant ID, selecting specific columns: id, store_id, phone, customer_name, wa_verification_status.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number, store_id: number, phone: string, customer_name: string, wa_verification_status: string} | null>} The order object or null if not found
   */
  static async getOrderById(orderId, tenantId) {
    return db.prepare('SELECT id, store_id, phone, customer_name, wa_verification_status FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Fetches an order record by its ID and tenant ID, selecting all columns.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Object | null>} The order object or null if not found
   */
  static async getFullOrderById(orderId, tenantId) {
    return db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Fetches an order record by its ID and tenant ID, selecting specific columns for manual send validation: id, store_id, phone, customer_name.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number, store_id: number, phone: string, customer_name: string} | null>} The order object or null if not found
   */
  static async getOrderForSend(orderId, tenantId) {
    return db.prepare('SELECT id, store_id, phone, customer_name FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Fetches an order record by its ID and tenant ID, selecting specific columns for media upload: id, store_id, phone.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number, store_id: number, phone: string} | null>} The order object or null if not found
   */
  static async getOrderForUploadMedia(orderId, tenantId) {
    return db.prepare('SELECT id, store_id, phone FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Fetches an order record by its ID and tenant ID, selecting specific columns for sending images: id, store_id, phone, customer_name, line_items.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number, store_id: number, phone: string, customer_name: string, line_items: string} | null>} The order object or null if not found
   */
  static async getOrderForSendImages(orderId, tenantId) {
    return db.prepare('SELECT id, store_id, phone, customer_name, line_items FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Fetches an order record by its ID and tenant ID, selecting specific columns for sending quick replies: id, store_id, phone, customer_name, tracking_number, courier.
   * @param {number|string} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number, store_id: number, phone: string, customer_name: string, tracking_number: string|null, courier: string|null} | null>} The order object or null if not found
   */
  static async getOrderForSendQuickReply(orderId, tenantId) {
    return db.prepare('SELECT id, store_id, phone, customer_name, tracking_number, courier FROM orders WHERE id = ? AND tenant_id = ?').get(Number(orderId), tenantId) || null;
  }

  /**
   * Retrieves historical database messages for a given phone or order ID under a specific tenant.
   * @param {string} phone - The normalized phone number
   * @param {number} orderId - The order ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Array<Object>>} List of message records
   */
  static async getMessagesForChat(phone, orderId, tenantId) {
    const last10 = phone.substring(phone.length - 10);
    return db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE (phone LIKE ? OR order_id = ?) AND tenant_id = ? 
      ORDER BY id ASC
    `).all(`%${last10}%`, orderId, tenantId);
  }

  /**
   * Inserts a manual text message record into the SQLite database.
   * @param {Object} params
   * @param {number} params.storeId - The store identifier
   * @param {number|null} params.orderId - The order identifier
   * @param {string} params.phone - The normalized phone number
   * @param {string} params.message - The text message body
   * @param {string|null} [params.messageId] - Unique message UUID
   * @param {string} params.tenantId - The tenant identifier
   * @param {string|null} [params.quoteContext] - Stringified quote context or JSON object
   * @returns {Promise<{lastInsertRowid: number|string}>} Database run result info
   */
  static async saveOutgoingMessage({ storeId, orderId, phone, message, messageId = null, tenantId, quoteContext = null }) {
    const resolvedQuote = typeof quoteContext === 'object' && quoteContext !== null 
      ? JSON.stringify(quoteContext) 
      : quoteContext;
    const result = db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, status, tenant_id, quote_context)
      VALUES (?, ?, ?, 'outgoing', ?, ?, 'sent', ?, ?)
    `).run(storeId, orderId, phone, message, messageId, tenantId, resolvedQuote);
    return { lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Inserts a manual text message record without messageId or quoteContext.
   * @param {Object} params
   * @param {number} params.storeId - The store identifier
   * @param {number|null} params.orderId - The order identifier
   * @param {string} params.phone - The normalized phone number
   * @param {string} params.message - The text message body
   * @param {string} params.tenantId - The tenant identifier
   * @returns {Promise<{lastInsertRowid: number|string}>} Database run result info
   */
  static async saveOutgoingTextMessageSimple({ storeId, orderId, phone, message, tenantId }) {
    const result = db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
      VALUES (?, ?, ?, 'outgoing', ?, 'sent', ?)
    `).run(storeId, orderId, phone, message, tenantId);
    return { lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Inserts a manual media message record into the SQLite database.
   * @param {Object} params
   * @param {number} params.storeId - The store identifier
   * @param {number|null} params.orderId - The order identifier
   * @param {string} params.phone - The normalized phone number
   * @param {string} params.message - The text/caption message or media representation
   * @param {string|null} [params.messageId] - Unique message UUID
   * @param {string|null} params.mediaUrl - The relative media URL or path
   * @param {string|null} params.mediaType - The type of media ('image', 'video', 'audio', 'document')
   * @param {string} params.tenantId - The tenant identifier
   * @param {string|null} [params.quoteContext] - Stringified quote context or JSON object
   * @returns {Promise<{lastInsertRowid: number|string}>} Database run result info
   */
  static async saveOutgoingMediaMessage({ storeId, orderId, phone, message, messageId = null, mediaUrl, mediaType, tenantId, quoteContext = null }) {
    const resolvedQuote = typeof quoteContext === 'object' && quoteContext !== null 
      ? JSON.stringify(quoteContext) 
      : quoteContext;
    const result = db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id, quote_context)
      VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?, ?)
    `).run(storeId, orderId, phone, message, messageId, mediaUrl, mediaType, tenantId, resolvedQuote);
    return { lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Inserts a manual media message record without messageId or quoteContext (simple media log).
   * @param {Object} params
   * @param {number} params.storeId - The store identifier
   * @param {number|null} params.orderId - The order identifier
   * @param {string} params.phone - The normalized phone number
   * @param {string} params.message - The text/caption message or media representation
   * @param {string} params.mediaUrl - The relative media URL or path
   * @param {string} params.mediaType - The type of media
   * @param {string} params.tenantId - The tenant identifier
   * @returns {Promise<{lastInsertRowid: number|string}>} Database run result info
   */
  static async saveOutgoingMediaMessageSimple({ storeId, orderId, phone, message, mediaUrl, mediaType, tenantId }) {
    const result = db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status, tenant_id)
      VALUES (?, ?, ?, 'outgoing', ?, ?, ?, 'sent', ?)
    `).run(storeId, orderId, phone, message, mediaUrl, mediaType, tenantId);
    return { lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Computes the uniquely grouped chat threads list for a given tenant.
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Array<{phone: string, lastMessage: Object, order: Object|null, customerName: string|null}>>} Grouped chat threads
   */
  static async getRecentChats(tenantId) {
    const uniqueChats = db.prepare(`
      SELECT phone, MAX(id) as max_id 
      FROM whatsapp_messages 
      WHERE tenant_id = ?
        AND phone IN (
          SELECT DISTINCT phone FROM whatsapp_messages 
          WHERE tenant_id = ? 
            AND (direction = 'incoming' OR status NOT IN ('failed', 'pending', 'processing'))
        )
      GROUP BY phone 
      ORDER BY max_id DESC
    `).all(tenantId, tenantId);

    const chats = [];
    for (const chat of uniqueChats) {
      const msg = db.prepare('SELECT * FROM whatsapp_messages WHERE id = ? AND tenant_id = ?').get(chat.max_id, tenantId);
      if (!msg) continue;

      const last10 = chat.phone.substring(chat.phone.length - 10);
      const order = db.prepare(`
        SELECT id, store_id, customer_name, wa_verification_status, financial_status, fulfillment_status, total_price 
        FROM orders 
        WHERE phone LIKE ? AND tenant_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(`%${last10}%`, tenantId);

      chats.push({
        phone: chat.phone,
        lastMessage: msg,
        order: order || null,
        customerName: order ? order.customer_name : null
      });
    }
    return chats;
  }

  /**
   * Fetches all database message records mapped to a normalized phone number.
   * @param {string} phone - The normalized phone number
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Array<Object>>} List of database message records
   */
  static async getChatMessages(phone, tenantId) {
    let dbMessages = db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE phone = ? AND tenant_id = ?
      ORDER BY id ASC
    `).all(phone, tenantId);

    if (dbMessages.length === 0) {
      dbMessages = db.prepare(`
        SELECT * FROM whatsapp_messages 
        WHERE phone = ? AND tenant_id = ?
        ORDER BY id ASC
      `).all('+' + phone, tenantId);
    }
    return dbMessages;
  }

  /**
   * Retrieves the most recent order record for a given phone number (matched by last 10 digits).
   * @param {string} phone - The normalized phone number
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Object|null>} The latest order record, or null
   */
  static async getLatestOrderByPhone(phone, tenantId) {
    const last10 = phone.substring(phone.length - 10);
    return db.prepare(`
      SELECT * FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId) || null;
  }

  /**
   * Alias of getLatestOrderByPhone matching the exact function named in the implementation plan.
   * @param {string} phone - The normalized phone number
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Object|null>} The latest order record, or null
   */
  static async getOrderByPhoneLast10(phone, tenantId) {
    return this.getLatestOrderByPhone(phone, tenantId);
  }

  /**
   * Retrieves the full order history for a customer phone (matched by last 10 digits).
   * @param {string} phone - The normalized phone number
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Array<Object>>} List of orders matching the phone suffix
   */
  static async getOrderHistoryByPhone(phone, tenantId) {
    const last10 = phone.substring(phone.length - 10);
    return db.prepare(`
      SELECT id, store_id, customer_name, total_price, financial_status, fulfillment_status, wa_verification_status, created_timestamp AS created_at, phone
      FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC
    `).all(`%${last10}%`, tenantId);
  }

  /**
   * Fetches the customer profile by phone number.
   * @param {string} phone - The normalized phone number
   * @returns {Promise<{size_preference: string|null, is_big_and_tall: number|null, preferences: string|null, ad_source: string|null, risk_flag: string|null} | null>} The customer profile record, or null
   */
  static async getCustomerProfile(phone) {
    return db.prepare('SELECT size_preference, is_big_and_tall, preferences, ad_source, risk_flag FROM customer_profiles WHERE phone = ?').get(phone) || null;
  }

  /**
   * Resolves the latest incoming message for a phone number under a specific tenant.
   * @param {string} phone - The normalized phone number
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<{id: number} | null>} The latest incoming message record, or null
   */
  static async getLatestIncomingMessage(phone, tenantId) {
    return db.prepare(`
      SELECT id FROM whatsapp_messages 
      WHERE phone = ? AND direction = 'incoming' AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(phone, tenantId) || null;
  }

  /**
   * Updates the status of a WhatsApp message.
   * @param {number|string} messageId - The primary key ID of the message
   * @param {string} status - The status to set (e.g. 'read', 'delivered')
   * @returns {Promise<{changes: number}>} SQLite run result info
   */
  static async updateMessageStatus(messageId, status) {
    const result = db.prepare(`
      UPDATE whatsapp_messages 
      SET status = ? 
      WHERE id = ?
    `).run(status, messageId);
    return { changes: result.changes };
  }

  /**
   * Resolves a quick reply template by ID, searching tenant-specific templates first, then global templates.
   * @param {number|string} replyId - The quick reply template ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Object|null>} The quick reply template or null
   */
  static async getQuickReplyTemplate(replyId, tenantId) {
    const numericId = Number(replyId);
    let template = db.prepare('SELECT * FROM quick_replies WHERE id = ? AND tenant_id = ?').get(numericId, tenantId);
    if (!template) {
      template = db.prepare('SELECT * FROM whatsapp_quick_replies WHERE id = ?').get(numericId);
    }
    return template || null;
  }

  /**
   * Resolves a global quick reply template by ID.
   * @param {number|string} replyId - The quick reply template ID
   * @returns {Promise<Object|null>} The global quick reply template or null
   */
  static async getGlobalQuickReplyTemplate(replyId) {
    return db.prepare('SELECT * FROM whatsapp_quick_replies WHERE id = ?').get(Number(replyId)) || null;
  }

  /**
   * Resolves buttons mapped to a quick reply.
   * @param {number} quickReplyId - The ID of the quick reply template
   * @returns {Promise<Array<Object>>} List of button records
   */
  static async getQuickReplyButtons(quickReplyId) {
    return db.prepare('SELECT * FROM quick_reply_buttons WHERE quick_reply_id = ? ORDER BY position ASC, id ASC').all(quickReplyId);
  }

  /**
   * Fetches a WhatsApp message record by its message_id and tenant_id.
   * @param {string} messageId - The unique message ID
   * @param {string} tenantId - The tenant identifier
   * @returns {Promise<Object|null>} The message record, or null
   */
  static async getMessageByMessageId(messageId, tenantId) {
    return db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE message_id = ? AND tenant_id = ?
      LIMIT 1
    `).get(messageId, tenantId) || null;
  }

  /**
   * Fetches an order record by ID without tenant isolation (for testing/admin purposes).
   * @param {number|string} orderId - The order ID
   * @returns {Promise<Object|null>} The order object or null
   */
  static async getOrderByIdNoTenant(orderId) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId)) || null;
  }
}

module.exports = WaGovernanceService;
