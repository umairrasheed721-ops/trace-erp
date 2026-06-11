/**
 * WhatsApp Engine Abstraction Service
 * Decouples the rest of the application from direct Baileys socket interaction.
 * Exposes clean, multi-tenant compatible send utilities with standard JSDoc typings.
 */

const bot = require('../engines/whatsapp_bot');
const { normalizePhone } = require('../engines/whatsapp_message_processor');

/**
 * @typedef {Object} MessageResponse
 * @property {boolean} success - Represents whether the message dispatch succeeded
 * @property {string} [messageId] - The unique ID assigned to the dispatched message
 * @property {string} [error] - The error message string in case of failures
 */

class WhatsappService {
  /**
   * Dispatches a plain text WhatsApp message.
   * @param {string} phone - The recipient phone number (auto-normalized to JID)
   * @param {string} text - The text payload body of the message
   * @param {string} [clientUuid] - Optional unique client-side message identifier
   * @returns {Promise<MessageResponse>} Object detailing the success/fail result
   */
  async sendText(phone, text, clientUuid = null) {
    if (!phone || !text) {
      return { success: false, error: 'Phone and text content are required' };
    }

    try {
      const cleaned = normalizePhone(phone);
      const result = await bot.sendMessage(cleaned, text, true, null, null, null, clientUuid);
      
      return {
        success: result?.success !== false,
        messageId: result?.message?.message_id || clientUuid || String(Date.now()),
        error: result?.error || null
      };
    } catch (err) {
      console.error('[WA-SERVICE-TEXT-ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatches a media attachment message (image, video, audio, or document).
   * @param {string} phone - The recipient phone number (auto-normalized to JID)
   * @param {string} mediaUrl - The file path or web URL containing the media
   * @param {string} [caption] - Text caption describing the media item
   * @param {string} [mediaType='image'] - The type of media: 'image' | 'video' | 'audio' | 'document'
   * @param {string} [clientUuid] - Optional unique client-side message identifier
   * @returns {Promise<MessageResponse>} Object detailing the success/fail result
   */
  async sendMedia(phone, mediaUrl, caption = '', mediaType = 'image', clientUuid = null) {
    if (!phone || !mediaUrl) {
      return { success: false, error: 'Phone and media URL are required' };
    }

    try {
      const cleaned = normalizePhone(phone);
      const result = await bot.sendMessage(cleaned, caption, true, mediaUrl, mediaType, null, clientUuid);
      
      return {
        success: result?.success !== false,
        messageId: result?.message?.message_id || clientUuid || String(Date.now()),
        error: result?.error || null
      };
    } catch (err) {
      console.error('[WA-SERVICE-MEDIA-ERROR]', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new WhatsappService();
