/**
 * WhatsApp Inbound Message Router
 * Decouples upsert routing from heavy business logic.
 * Parses text triggers and routes contexts to isolated handlers.
 */

const whatsappService = require('../services/whatsappService');
const codConfirmationHandler = require('../handlers/waHandlers/codConfirmationHandler');
const fallbackReplyHandler = require('../handlers/waHandlers/fallbackReplyHandler');
const feedbackCrossSellHandler = require('../handlers/waHandlers/feedbackCrossSellHandler');

/**
 * @typedef {Object} InboundMessageContext
 * @property {string} phone - Normalized sender phone number
 * @property {string} text - Processed text string content from message
 * @property {string} senderName - Sender push name / display name
 * @property {string} tenantId - Tenant identifier
 * @property {Object} db - SQLite database reference
 * @property {Object} dbPool - SQLite database reference alias
 * @property {Object} waService - Abstracted WhatsappService reference
 */

class WaMessageRouter {
  /**
   * Route inbound messages to their matching handlers.
   * @param {InboundMessageContext} ctx - Inbound message details and database context
   * @returns {Promise<void>} Resolves when the designated handler has finished execution
   */
  async route(ctx) {
    const text = (ctx.text || '').trim();
    console.log(`[WA-ROUTER] Routing message from ${ctx.phone}: "${text}" (tenant: ${ctx.tenantId})`);

    // Intent 1: COD order confirmation replies (exact triggers: '1', '2', '3')
    if (['1', '2', '3'].includes(text)) {
      return codConfirmationHandler.handle(ctx);
    }

    // Intent 2: Text variations of confirmations
    if (text.toLowerCase() === 'confirm' || text.toLowerCase() === 'cancel') {
      return codConfirmationHandler.handle(ctx);
    }

    // Intent 3: Post-delivery feedback replies
    if (text.toLowerCase().includes('feedback') || text.toLowerCase().includes('review') || text.toLowerCase().includes('rate')) {
      return feedbackCrossSellHandler.handle(ctx);
    }

    // Intent 4: Fallback to auto-responders & AI/Gemini engine
    return fallbackReplyHandler.handle(ctx);
  }
}

module.exports = new WaMessageRouter();
