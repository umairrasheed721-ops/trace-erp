/**
 * Feedback & Cross-Sell Inbound Handler
 * Receives standardized inbound message contexts and manages post-delivery ratings.
 */

/**
 * @typedef {import('../../routers/waMessageRouter').InboundMessageContext} InboundMessageContext
 */

class FeedbackCrossSellHandler {
  /**
   * Handle the inbound message context for post-delivery feedback.
   * @param {InboundMessageContext} ctx - Standardized context structure
   * @returns {Promise<void>}
   */
  async handle(ctx) {
    const text = (ctx.text || '').trim();
    console.log(`[FEEDBACK-CROSS-SELL-HANDLER] Processing feedback trigger "${text}" for phone: ${ctx.phone}`);

    // Business logic to extract ratings (1-5), log them to SQLite, and recommend products
    try {
      const { db } = ctx;
      const ratingMatch = text.match(/\b([1-5])\b/);
      if (ratingMatch) {
        const ratingVal = parseInt(ratingMatch[1]);
        console.log(`[FEEDBACK-CROSS-SELL-HANDLER] Extracted rating: ${ratingVal} stars`);
        
        // Save rating to database
        db.prepare(`
          UPDATE customer_profiles 
          SET notes = coalesce(notes, '') || ' | Customer rating: ' || ? 
          WHERE phone = ?
        `).run(String(ratingVal), ctx.phone);
        
        if (ratingVal >= 4) {
          // Send high-rating positive cross-sell message
          await ctx.waService.sendText(ctx.phone, '🎉 Thank you so much for the review! Here is a 10% coupon for your next purchase: TRACE10.');
        } else {
          // Send support handoff
          await ctx.waService.sendText(ctx.phone, '😔 We are sorry to hear that. A customer support representative will get back to you shortly.');
        }
      }
    } catch (err) {
      console.error('[FEEDBACK-CROSS-SELL-HANDLER-ERROR]', err.message);
    }
  }
}

module.exports = new FeedbackCrossSellHandler();
