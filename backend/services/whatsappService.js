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
 * @property {string} [messageId] - The unique ID assigned to the dispatched message by the Baileys socket
 * @property {string} [error] - The error message string in case of failures
 */

class WhatsappService {
  /**
   * Retrieves the active Baileys socket from the whatsapp_bot instance.
   * @returns {any}
   */
  get sock() {
    return bot.sock;
  }

  /**
   * Dispatches a plain text WhatsApp message using the active Baileys socket.
   * @param {string} phone - The recipient phone number (auto-normalized to JID)
   * @param {string} text - The text payload body of the message
   * @param {string} [clientUuid] - Optional unique client-side message identifier
   * @returns {Promise<MessageResponse>} Object detailing the success/fail result
   */
  async sendText(phone, text) {
    if (!this.sock) {
        console.error('[WA-FATAL] Baileys socket reference is missing in whatsappService!');
        throw new Error("WhatsApp socket not initialized.");
    }

    // Clean and format JID strictly
    let jid = phone.toString().replace(/[^0-9]/g, '');
    if (!jid.endsWith('@s.whatsapp.net')) jid = `${jid}@s.whatsapp.net`;

    console.log(`[WA-RAW-BYPASS] Firing message directly to Meta for JID: ${jid}`);
    
    // RAW DISPATCH - No queues, no delays
    const result = await this.sock.sendMessage(jid, { text: text });
    
    console.log(`[WA-RAW-SUCCESS] Baileys Message ID: ${result?.key?.id}`);
    return { success: true, messageId: result?.key?.id };
  }

  /**
   * Dispatches a media attachment message (image, video, audio, or document) using the active Baileys socket.
   * @param {string} phone - The recipient phone number (auto-normalized to JID)
   * @param {string} mediaUrl - The file path or web URL containing the media
   * @param {string} [caption] - Text caption describing the media item
   * @param {string} [mediaType='image'] - The type of media: 'image' | 'video' | 'audio' | 'document'
   * @param {string} [clientUuid] - Optional unique client-side message identifier
   * @returns {Promise<MessageResponse>} Object detailing the success/fail result
   */
  async sendMedia(phone, mediaUrl, caption = '', mediaType = 'image', clientUuid = null) {
    if (!this.sock) throw new Error("Baileys socket is not connected!");

    // Format JID
    let jid = phone.replace(/[^0-9]/g, '');
    if (!jid.endsWith('@s.whatsapp.net')) jid = `${jid}@s.whatsapp.net`;

    console.log(`[WA-REAL-DISPATCH] Sending media (${mediaType}) to Baileys Socket: ${jid}`);

    let mediaPayload;
    if (mediaType === 'image') {
      mediaPayload = { image: { url: mediaUrl }, caption };
    } else if (mediaType === 'video') {
      mediaPayload = { video: { url: mediaUrl }, caption, mimetype: 'video/mp4' };
    } else if (mediaType === 'audio' || mediaType === 'voice') {
      mediaPayload = { audio: { url: mediaUrl }, ptt: true, mimetype: 'audio/mp4' };
    } else {
      mediaPayload = { document: { url: mediaUrl }, caption, mimetype: 'application/pdf', fileName: 'document.pdf' };
    }

    const result = await this.sock.sendMessage(jid, mediaPayload);

    return {
      success: true,
      messageId: result?.key?.id || clientUuid
    };
  }
}

module.exports = new WhatsappService();
