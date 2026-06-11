/**
 * COD Confirmation Reply Handler
 * Receives standardized inbound message contexts and manages order confirmation states.
 */

/**
 * @typedef {import('../../routers/waMessageRouter').InboundMessageContext} InboundMessageContext
 */

class CodConfirmationHandler {
  /**
   * Handle the inbound message context for COD confirmations.
   * @param {InboundMessageContext} ctx - Standardized context structure
   * @returns {Promise<void>}
   */
  async handle(ctx) {
    const text = (ctx.text || '').trim();
    console.log(`[COD-CONFIRMATION-HANDLER] Processing numeric trigger "${text}" for phone: ${ctx.phone}`);

    let tagToApply = null;
    if (text === '1' || text.toLowerCase() === 'confirm') {
      tagToApply = 'Trace: Confirmed';
    } else if (text === '2' || text.toLowerCase() === 'cancel') {
      tagToApply = 'Trace: Cancelled';
    } else if (text === '3') {
      tagToApply = 'Trace: Edit Requested';
    }

    if (tagToApply) {
      try {
        const { processNumericReply } = require('../../engines/cod_verifier');
        await processNumericReply(ctx.phone, text, tagToApply, ctx.tenantId);
      } catch (err) {
        console.error(`[COD-CONFIRMATION-HANDLER-ERROR] Failed to process numeric reply for ${ctx.phone}:`, err.message);
      }
    } else {
      console.warn(`[COD-CONFIRMATION-HANDLER] Unmapped trigger value: "${text}". Skipping tag action.`);
    }
  }
}

module.exports = new CodConfirmationHandler();
