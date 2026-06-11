/**
 * Fallback Inbound Message Handler
 * Manages unmatched keyword routing, dynamic auto-responder rules checks, and Gemini AI fallbacks.
 */

/**
 * @typedef {import('../../routers/waMessageRouter').InboundMessageContext} InboundMessageContext
 */

class FallbackReplyHandler {
  /**
   * Handle unmatched or general text messages.
   * @param {InboundMessageContext} ctx - Standardized context structure
   * @returns {Promise<void>}
   */
  async handle(ctx) {
    const text = (ctx.text || '').trim();
    console.log(`[FALLBACK-REPLY-HANDLER] Entering fallback processing for phone: ${ctx.phone}, message: "${text}"`);

    try {
      const { db, tenantId } = ctx;
      
      // Step 1: Scan dynamic keyword auto-responders
      let matchedResponder = null;
      try {
        const settingsRow = db.prepare('SELECT auto_responders FROM whatsapp_settings WHERE tenant_id = ?').get(tenantId);
        if (settingsRow && settingsRow.auto_responders) {
          const rules = JSON.parse(settingsRow.auto_responders);
          if (Array.isArray(rules)) {
            // Check exact keyword match (case-insensitive)
            matchedResponder = rules.find(rule => 
              rule.trigger && rule.trigger.trim().toLowerCase() === text.toLowerCase()
            );
            
            // If no exact match, fallback to the catch-all responder if configured
            if (!matchedResponder) {
              matchedResponder = rules.find(rule => 
                rule.trigger && rule.trigger.trim().toLowerCase() === 'fallback'
              );
            }
          }
        }
      } catch (dbErr) {
        console.warn('⚠️ [FALLBACK-REPLY-HANDLER] Failed to fetch auto-responders from SQLite settings:', dbErr.message);
      }

      if (matchedResponder && matchedResponder.response) {
        console.log(`[FALLBACK-REPLY-HANDLER] Found matching auto-responder rule for trigger: "${matchedResponder.trigger}"`);
        await ctx.waService.sendText(ctx.phone, matchedResponder.response);
        return;
      }

      // Step 2: Delegate to global message processor for Gemini AI handling or defaults
      console.log(`[FALLBACK-REPLY-HANDLER] No responder matched. Delegating to main incoming message processor.`);
      const { processIncomingMessage } = require('../../engines/whatsapp_message_processor');
      
      // Build mock Baileys message structure to delegate seamlessly
      const mockMsg = {
        key: {
          remoteJid: ctx.phone + '@s.whatsapp.net',
          fromMe: false,
          id: 'mock-uuid-' + Math.random().toString(36).substring(2) + Date.now().toString(36)
        },
        message: {
          conversation: text
        },
        pushName: ctx.senderName || 'Customer',
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      const botInstance = require('../../engines/whatsapp_bot');
      await processIncomingMessage(botInstance, mockMsg, db);
    } catch (err) {
      console.error('[FALLBACK-REPLY-HANDLER-ERROR] Failed to run fallback logic:', err.message);
    }
  }
}

module.exports = new FallbackReplyHandler();
