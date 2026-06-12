/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Uses dynamic import() because Baileys is ESM-only.
 */

const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db, DB_DIR } = require('../db');
const { transcodeToOpus, safeUnlink, TAG: FFMPEG_TAG } = require('./ffmpeg_transcode');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction
  ? '/app/data/trace_erp.db'
  : path.join(__dirname, '..', 'trace_erp.db');
const dbPath = process.env.DB_PATH || defaultDbPath;
const dbDir = path.dirname(path.resolve(dbPath));
const tenantContext = require('../tenant-context');

const {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  saveMediaFile,
  processQueue,
  processIncomingMessage,
  adaptiveStrategy
} = require('./whatsapp_message_processor');

// Extracted modules
const sessionManager = require('./bot/sessionManager');
const eventRouter = require('./bot/eventRouter');
const groupHandler = require('./bot/groupHandler');

/**
 * Core engine representing a WhatsApp Bot session connection using the Baileys library.
 * Manages automated message dispatching, priority queues, session lifecycle,
 * and smart anti-ban pacing rules.
 */
class WhatsAppBot {
  /**
   * Initializes the WhatsAppBot session instance.
   * 
   * @param {string} [tenantId='default'] - Active tenant ID for partitioning configurations/databases
   */
  constructor(tenantId) {
    this.tenantId = tenantId || 'default';
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this._isLoggedOut = false; // set true only on 401 loggedOut
    
    // --- 🛡️ ANTI-BAN THROTTLING SYSTEM ---
    this.queue = [];
    this.isProcessing = false;
    this.hourlyCount = 0;
    this.lastResetTime = Date.now();
    this.humanCooldowns = {}; // { phone: timestamp }
    
    // --- 🛡️ MODULE 6: ANTI-BAN SHIELD PROPERTIES ---
    this.sentCountInSession = 0;
    this.sleepThreshold = 30; // Rotate / Rest after 30 messages
    this.isSleeping = false;
    this.sleepUntil = null;
    this.consecutiveBulkSentCount = 0;
    this.contactMessageTimestamps = {}; // maps phone number to arrays of timestamps
    this.contactLastIncomingTimestamp = {}; // maps phone number to timestamp of last incoming msg

    // Dynamic governance parameters
    this.isPaused = false;
    this.minDelaySec = 5;
    this.maxDelaySec = 15;
    this.maxPerHour = 60;
    this.coolingPeriodMin = 15;
    this.auditLogs = []; // Buffer of recent delivery audits

    // --- 🤖 MODULE 5: AUTO-RESPONSE STUDIO ---
    this.humanHandoffContacts = new Set(); // phones currently in human-intervention mode
    this.consecutiveBotReplies = {};       // phone -> count of consecutive bot replies without a human reply
    this._botSentIds = new Set();          // message IDs sent by the bot itself (to detect echoes)

    // --- ⚡ FIX: HIGH-PRIORITY QUEUE (active chat sessions jump the bulk queue) ---
    this.priorityQueue = [];   // Messages from live agent sessions or active incoming chats
    this.activeChats = new Set(); // phones with recent incoming activity (within 5 min)

    // --- 🔒 STABILITY FIX: Global dedup lock + per-phone concurrency guard ---
    // sentMessages: Map<phone, lastTimestamp> — blocks identical auto-replies within 5s
    this.sentMessages = new Map();
    // processingReplies: Set<phone> — prevents concurrent auto-reply execution for same phone
    this.processingReplies = new Set();

    // Prevent local dev from running the bot unless explicitly enabled
    if (!isProduction) {
      console.log('🛑 WhatsApp Bot disabled in local dev to prevent message stealing. Set BOT_ENABLED=true to force.');
      this.status = 'DISABLED';
      return;
    }

    // Periodically clean up local state caches to prevent memory leaks
    setInterval(() => {
      try {
        this._cleanOldStates();
      } catch (e) {
        console.error('⚠️ Failed to clean old bot states:', e.message);
      }
    }, 3600000); // Clean every hour

    // Start outgoing queue processor polling interval
    // ======================================================================
    // ⚠️ @AI-CRITICAL-ZONE: HIGH FRAGILITY SYSTEM BLOCK
    // CONCURRENCY, PACING, OR SYNC LOGIC HERE.
    // DO NOT REFACTOR OR MODIFY THIS BLOCK WITHOUT EXPLICIT HUMAN APPROVAL.
    // ======================================================================
    setInterval(async () => {
      if (this.status !== 'CONNECTED' || !this.sock) return;
      try {
        await this.processOutgoingQueue();
      } catch (err) {
        console.error(`[WA-QUEUE-ERR] [Tenant: ${this.tenantId}]`, err.message);
      }
    }, 2000);

    setTimeout(() => this._connect(), 5000);
  }

  /**
   * Retrieves the absolute filesystem directory path where Baileys stores authentication keys.
   * 
   * @returns {string} The path to authentication session credentials
   */
  getSessionPath() {
    return sessionManager.getSessionPath(this);
  }

  /**
   * Schedules a delayed reconnect attempt using pacing timers.
   * 
   * @returns {void}
   */
  _scheduleReconnect() {
    return sessionManager._scheduleReconnect(this);
  }

  /**
   * Attempts connection to WhatsApp socket servers via the session manager.
   * 
   * @returns {Promise<void>}
   */
  async _connect() {
    return sessionManager.connectBot(this);
  }

  /**
   * Wipes cached message stores in database session contexts.
   * 
   * @returns {Promise<void>}
   */
  async _clearSessionStore() {
    return sessionManager._clearSessionStore(this);
  }

  /**
   * Deletes local Baileys session files from storage.
   * 
   * @returns {Promise<void>}
   */
  async _wipeCreds() {
    return sessionManager._wipeCreds(this);
  }

  /**
   * Fetches pending messages from the outbound database queue, formats the JID,
   * handles quick replies/pasting, applies automated pacing intervals,
   * and fires message dispatches over the active socket.
   * 
   * @returns {Promise<void>}
   */
  async processOutgoingQueue() {
    // Fetch 1 oldest pending message from queue DB for this tenant
    const msg = db.prepare(`
      SELECT * FROM whatsapp_message_queue 
      WHERE status = 'pending' AND tenant_id = ?
      ORDER BY id ASC LIMIT 1
    `).get(this.tenantId);

    if (!msg) return;

    console.log(`[WA-QUEUE] [Tenant: ${this.tenantId}] Found pending outgoing message ID: ${msg.id}`);

    // Fetch current settings
    const settings = db.prepare('SELECT enable_automated_broadcasts, vip_bypass_manual, min_delay_sec, max_delay_sec FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};

    // SMART ROUTING LOGIC:
    if (msg.is_manual === 1 && settings.vip_bypass_manual === 0) {
      console.warn(`[WA-QUEUE] [Tenant: ${this.tenantId}] Manual dispatch disabled. Cancelling message ID: ${msg.id}`);
      db.prepare("UPDATE whatsapp_message_queue SET status = 'failed' WHERE id = ?").run(msg.id);
      db.prepare("UPDATE whatsapp_messages SET status = 'failed' WHERE message_id = ?").run(msg.client_uuid);
      return;
    }

    if (msg.is_manual !== 1 && settings.enable_automated_broadcasts === 0) {
      console.warn(`[WA-QUEUE] [Tenant: ${this.tenantId}] Automated broadcast disabled. Cancelling message ID: ${msg.id}`);
      db.prepare("UPDATE whatsapp_message_queue SET status = 'failed' WHERE id = ?").run(msg.id);
      db.prepare("UPDATE whatsapp_messages SET status = 'failed' WHERE message_id = ?").run(msg.client_uuid);
      return;
    }

    try {
      // Mark as 'processing' to prevent double sends
      db.prepare("UPDATE whatsapp_message_queue SET status = 'processing' WHERE id = ?").run(msg.id);
      db.prepare("UPDATE whatsapp_messages SET status = 'processing' WHERE message_id = ?").run(msg.client_uuid);

      // If it's an automated marketing bot, apply the Anti-Ban Pacing Delay
      // ======================================================================
      // ⚠️ @AI-CRITICAL-ZONE: HIGH FRAGILITY SYSTEM BLOCK
      // CONCURRENCY, PACING, OR SYNC LOGIC HERE.
      // DO NOT REFACTOR OR MODIFY THIS BLOCK WITHOUT EXPLICIT HUMAN APPROVAL.
      // ======================================================================
      if (msg.is_manual !== 1) {
        const minDelay = settings.min_delay_sec || 5;
        const maxDelay = settings.max_delay_sec || 15;
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`[WA-QUEUE] [Tenant: ${this.tenantId}] Applying automated anti-ban pacing delay of ${delay}s...`);
        await new Promise(res => setTimeout(res, delay * 1000));
      }

      // Format JID
      let jid = msg.phone.replace(/[^0-9]/g, '');
      if (!jid.endsWith('@s.whatsapp.net')) {
        jid = `${jid}@s.whatsapp.net`;
      }

      console.log(`[WA-QUEUE] [Tenant: ${this.tenantId}] Sending message ID: ${msg.id} to JID: ${jid}`);
      
      let payload = { text: msg.message };
      
      // If the message has quote context, resolve and pass it in options
      let sendOptions = {};
      if (msg.quote_context) {
        try {
          const parsedQuote = JSON.parse(msg.quote_context);
          if (parsedQuote && (parsedQuote.id || parsedQuote.message_id)) {
            const qid = parsedQuote.id || parsedQuote.message_id;
            const quotedRow = db.prepare(`
              SELECT * FROM whatsapp_messages 
              WHERE message_id = ? AND tenant_id = ?
              LIMIT 1
            `).get(qid, this.tenantId);

            const quotedMsgContent = {
              conversation: parsedQuote.text || (quotedRow ? quotedRow.message : '') || 'Media'
            };

            const quotedMessage = {
              key: {
                remoteJid: jid,
                fromMe: quotedRow ? quotedRow.direction === 'outgoing' : false,
                id: qid,
                participant: parsedQuote.participant || jid
              },
              message: quotedMsgContent
            };
            sendOptions.quoted = quotedMessage;
            console.log(`[WA-QUEUE] [Tenant: ${this.tenantId}] Appended quote context to message send payload`);
          }
        } catch (quoteErr) {
          console.warn('[WA-QUEUE] Failed to construct quote context options:', quoteErr.message);
        }
      }

      const result = await this.sock.sendMessage(jid, payload, sendOptions);
      const realMessageId = result?.key?.id || msg.client_uuid;

      // Mark as 'sent'
      db.prepare("UPDATE whatsapp_message_queue SET status = 'sent', message_id = ? WHERE id = ?").run(realMessageId, msg.id);
      db.prepare("UPDATE whatsapp_messages SET status = 'sent', message_id = ? WHERE message_id = ?").run(realMessageId, msg.client_uuid);

      console.log(`[WA-QUEUE] [Tenant: ${this.tenantId}] Message ID: ${msg.id} successfully sent! Real ID: ${realMessageId}`);

      // Broadcast message status update via WebSocket for instant UI update
      try {
        const { broadcast } = require('../websocket');
        broadcast('messages.update', {
          id: msg.client_uuid,
          status: 'sent'
        });
        broadcast('messages.update', {
          id: realMessageId,
          status: 'sent'
        });
      } catch (wsErr) {
        console.warn('[WA-QUEUE] WebSocket status update broadcast failed:', wsErr.message);
      }
    } catch (err) {
      console.error(`[WA-QUEUE-ERR] Failed to process queue message ID: ${msg.id}`, err);
      try {
        db.prepare("UPDATE whatsapp_message_queue SET status = 'failed' WHERE id = ?").run(msg.id);
        db.prepare("UPDATE whatsapp_messages SET status = 'failed' WHERE message_id = ?").run(msg.client_uuid);
      } catch (dbErr) {
        console.error(`[WA-QUEUE-ERR] Failed to mark message ID: ${msg.id} as failed:`, dbErr.message);
      }
    }
  }

  /**
   * Applies random variations to greeting text templates to minimize ban detection.
   * 
   * @param {string} text - Raw template text
   * @returns {string} Text with micro-variations
   */
  variateTemplateMessage(text) {
    if (!text || typeof text !== 'string') return text;
    let modified = text;

    const greetings = [
      { pattern: /^(👋\s*)?hello\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] },
      { pattern: /^(👋\s*)?hi\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] },
      { pattern: /^(👋\s*)?salam\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] }
    ];

    for (const g of greetings) {
      if (g.pattern.test(modified)) {
        const randomGreeting = g.replacements[Math.floor(Math.random() * g.replacements.length)];
        modified = modified.replace(g.pattern, randomGreeting);
        break;
      }
    }

    const emojis = ['😊', '👍', '📦', '🙏', '✨', ''];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (randomEmoji) {
      if (modified.endsWith('.')) {
        modified = modified.slice(0, -1) + ' ' + randomEmoji;
      } else {
        modified = modified + ' ' + randomEmoji;
      }
    }

    const randomSuffix = Math.random() > 0.5 ? '\u200B' : ' ';
    modified = modified + randomSuffix;

    return modified;
  }

  /**
   * Blocks execution loop until the WebSocket connection is active, timing out after 10s.
   * 
   * @throws {Error} If connection status is not CONNECTED
   * @returns {Promise<void>}
   */
  async ensureConnected() {
    if (this.status === 'CONNECTED' && this.sock) {
      return;
    }
    console.log(`[TRACER_LOG] Connection not active (status: ${this.status}). Waiting for connection...`);
    
    const start = Date.now();
    while (Date.now() - start < 10000) {
      if (this.status === 'CONNECTED' && this.sock) {
        console.log(`[TRACER_LOG] Connection restored dynamically after ${Date.now() - start}ms.`);
        return;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    
    throw new Error(`WhatsApp is not connected (current status: ${this.status})`);
  }

  /**
   * Bypasses the pacing queue to immediately dispatch a message to WhatsApp.
   * Logs transaction to db, broadcasts event to web socket, handles failures.
   * 
   * @param {string} phone - Target recipient phone number
   * @param {string} message - Text body
   * @param {boolean} [isManual=false] - Manual dispatch vs automated template
   * @param {string} [mediaUrl=null] - Attachment URL
   * @param {string} [mediaType=null] - Attachment type (image, video, etc.)
   * @param {string} [fileName=null] - Custom name for file
   * @param {string} [customMessageId=null] - Tracking identifier
   * @param {object} [quoteContext=null] - Quoted message details
   * @param {object} [buttons=null] - Custom buttons configuration
   * @param {string} [buttonsMode='native'] - Native buttons mode flag
   * @param {object} [poll=null] - Poll structure config
   * @param {object} [options={}] - Query context options
   * @returns {Promise<object>} Result payload returned by Baileys
   */
  async directSendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null, buttons = null, buttonsMode = 'native', poll = null, options = {}) {
    await this.ensureConnected();

    const cleaned = normalizePhone(phone);
    const jid = cleaned + '@s.whatsapp.net';
    const uuid = customMessageId || require('crypto').randomUUID();

    const { db } = require('../db');
    let pollMessageText = null;
    let orderId = options?.orderId || options?.order_id || null;
    let storeId = options?.storeId || options?.store_id || null;
    if (!orderId || !storeId) {
      try {
        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId || 'default');
        if (order) {
          if (!orderId) orderId = order.id;
          if (!storeId) storeId = order.store_id;
        }
      } catch (e) {
        console.error('⚠️ [directSendMessage] Failed to pre-resolve order/store:', e.message);
      }
    }
    if (!storeId) storeId = 1;

    const adapted = adaptiveStrategy(phone, {
      message, quoteContext, buttons, buttonsMode, poll
    }, db, isManual);

    let finalMessage = adapted.message;
    quoteContext = adapted.quoteContext;
    buttons = adapted.buttons;
    buttonsMode = adapted.buttonsMode;
    poll = adapted.poll;

    if (!isManual && finalMessage && !adapted.hasComplained) {
      finalMessage = this.variateTemplateMessage(finalMessage);
    }

    let payload;
    let finalMediaType = mediaType;
    if (mediaUrl && !finalMediaType) {
      finalMediaType = 'image';
    }

    const hasButtons = buttons && Array.isArray(buttons) && buttons.length > 0;

    try {
      if (poll) {
        let order;
        try {
          const specificOrderId = options?.orderId || options?.order_id;
          if (specificOrderId) {
            order = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(specificOrderId);
          } else {
            order = db.prepare(`SELECT id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId || 'default');
          }
        } catch (e) {
          console.error('⚠️ [directSendMessage] Failed to query order for poll refactor:', e.message);
        }

        pollMessageText = poll.name;
        payload = { text: poll.name };
      } else if (hasButtons && buttonsMode === 'text') {
        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
        const listText = buttons.map((btn, idx) => {
          const emoji = numberEmojis[idx] || '🔘';
          return `${emoji} ${btn.label}`;
        }).join('\n');
        const textAppend = `\n\n${listText}`;
        const captionText = `${finalMessage || ''}${textAppend}`;

        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: captionText };
          } else if (finalMediaType === 'document') {
            payload = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: captionText };
          } else if (finalMediaType === 'video') {
            payload = { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: captionText };
          } else {
            payload = { text: captionText };
          }
        } else {
          payload = { text: captionText };
        }
      } else if (hasButtons && buttonsMode === 'native') {
        const nativeButtons = buttons.map((btn, idx) => {
          if (btn.button_type === 'url') {
            return {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: btn.label,
                url: btn.value,
                merchant_url: btn.value
              })
            };
          } else {
            return {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: btn.label,
                id: btn.value || `btn_${idx}`
              })
            };
          }
        });

        const interactivePayload = {
          interactiveMessage: {
            body: { text: finalMessage || 'Please select an option:' },
            nativeFlowMessage: {
              buttons: nativeButtons
            }
          }
        };

        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: finalMessage || '' };
          } else if (finalMediaType === 'document') {
            payload = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: finalMessage || '' };
          } else if (finalMediaType === 'video') {
            payload = { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: finalMessage || '' };
          }
          payload = interactivePayload;
        } else {
          payload = interactivePayload;
        }
      } else if (options?.list || (mediaType === 'list' && message && typeof message === 'object')) {
        const listConfig = options.list || message;
        payload = {
          interactiveMessage: {
            body: { text: listConfig.text },
            footer: listConfig.footer ? { text: listConfig.footer } : undefined,
            header: listConfig.header ? { title: listConfig.header } : undefined,
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: listConfig.buttonText || "Options",
                    sections: listConfig.sections.map(sec => ({
                      title: sec.title,
                      rows: sec.rows.map(row => ({
                        title: row.title,
                        description: row.description || "",
                        id: row.rowId
                      }))
                    }))
                  })
                }
              ]
            }
          }
        };
      } else {
        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: finalMessage || '' };
          } else if (finalMediaType === 'document') {
            payload = { 
              document: { url: mediaUrl }, 
              mimetype: 'application/pdf', 
              fileName: fileName || 'document.pdf', 
              caption: finalMessage || '' 
            };
          } else if (finalMediaType === 'audio' || finalMediaType === 'voice') {
            const getSecureMediaPath = (fname) => {
              const paths = [
                path.join('/app/data/media', fname),
                path.join('/app/data/uploads', fname),
                path.join(process.cwd(), 'data', 'media', fname)
              ];
              for (const p of paths) {
                if (fs.existsSync(p)) return p;
              }
              return null;
            };
            const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(path.resolve(mediaUrl)) ? path.resolve(mediaUrl) : null);
            if (!resolvedPath) {
              console.warn(`${FFMPEG_TAG} [DIRECT] SOURCE_MISSING local path for=${mediaUrl}. Falling back to URL payload.`);
              payload = {
                audio: { url: mediaUrl },
                ptt: true,
                mimetype: 'audio/mp4'
              };
            } else {
              const absInputPath = resolvedPath;
              let transcodeOutputPath = null;
              let finalAudioBuffer = null;
              let finalMime = 'audio/ogg; codecs=opus';

              try {
                const inputSizeBytes = fs.statSync(absInputPath).size;
                console.log(`${FFMPEG_TAG} [DIRECT] INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${finalMediaType}`);
                const result = await transcodeToOpus(absInputPath);
                transcodeOutputPath = result.outputPath;
                const outStat = fs.statSync(transcodeOutputPath);
                console.log(`${FFMPEG_TAG} [DIRECT] OUTPUT path=${transcodeOutputPath}  size=${outStat.size}B  duration=${result.durationSec}s`);
                finalAudioBuffer = fs.readFileSync(transcodeOutputPath);
                if (finalAudioBuffer.length < 100) {
                  throw new Error(`${FFMPEG_TAG} Output buffer suspiciously small (${finalAudioBuffer.length}B) — transcode likely failed`);
                }
              } catch (transcodeErr) {
                console.error(`${FFMPEG_TAG} [DIRECT] TRANSCODE_FAIL  error=${transcodeErr.message}`);
                try {
                  finalAudioBuffer = fs.readFileSync(absInputPath);
                  finalMime = 'audio/mp4';
                  console.warn(`${FFMPEG_TAG} [DIRECT] FALLBACK  sending raw file with mime=audio/mp4`);
                } catch (readErr) {
                  console.error(`${FFMPEG_TAG} [DIRECT] READ_FAIL  error=${readErr.message}`);
                  finalAudioBuffer = null;
                }
              }

              if (finalAudioBuffer) {
                payload = {
                  audio: finalAudioBuffer,
                  ptt: true,
                  mimetype: finalMime,
                };
              } else {
                console.warn(`${FFMPEG_TAG} [DIRECT] Fallback to URL payload due to read/transcode failure.`);
                payload = {
                  audio: { url: mediaUrl },
                  ptt: true,
                  mimetype: 'audio/mp4'
                };
              }

              if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
                try { await safeUnlink(transcodeOutputPath); } catch(_) {}
              }
            }
          } else if (finalMediaType === 'video') {
            payload = { 
              video: { url: mediaUrl }, 
              mimetype: 'video/mp4', 
              caption: finalMessage || '' 
            };
          } else {
            payload = { text: String(finalMessage) };
          }
        } else {
          const textContent = String(finalMessage || '');
          if (!textContent || textContent.trim() === '') {
            console.error('🚫 DIRECT_BLANK_MSG_BLOCKED: Attempted to send empty text message to', cleaned);
            throw new Error('BLANK_MSG_BLOCKED');
          }
          payload = { text: textContent };
        }
      }

      if (quoteContext) {
        const stanzaId = quoteContext.id || quoteContext.stanzaId || quoteContext.message_id;
        if (stanzaId) {
          payload.contextInfo = {
            stanzaId: stanzaId,
            participant: quoteContext.participant,
            quotedMessage: {
              conversation: quoteContext.text || "Media"
            }
          };
        }
      }

      try {
        await this.sock.sendPresenceUpdate('composing', jid);
      } catch (e) {}

      const delays = [2000, 4000, 8000];
      let attempt = 0;
      let sentMsg;

      this._botSentIds.add(uuid);
      const deleteTimeout = setTimeout(() => this._botSentIds.delete(uuid), 30000);

      while (true) {
        try {
          const sendOptions = { messageId: uuid };
          sentMsg = await this.sock.sendMessage(jid, payload, sendOptions);
          break;
        } catch (err) {
          attempt++;
          if (attempt > 3) {
            this._botSentIds.delete(uuid);
            clearTimeout(deleteTimeout);
            throw err;
          }
          const retryDelay = delays[attempt - 1];
          console.warn(`[DIRECT_RETRY] sendMessage failed for ${jid}, retry ${attempt}/3 in ${retryDelay}ms. Error: ${err.message}`);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }

      try {
        await this.sock.sendPresenceUpdate('paused', jid);
      } catch (e) {}

      const messageId = sentMsg?.key?.id || uuid;
      if (messageId !== uuid) {
        this._botSentIds.add(messageId);
        setTimeout(() => this._botSentIds.delete(messageId), 30000);
      }
      this.hourlyCount++;
      console.log(`✉️ [DIRECT] Sent to ${cleaned} (Total this hour: ${this.hourlyCount})`);
      this._addAuditLog(cleaned, 'Sent', '');

      // Log success to DB & broadcast via WebSocket
      const { db } = require('../db');
      let dbMessageId = null;
      try {
        let dbMessageContent;
        if (poll) {
          dbMessageContent = pollMessageText || `🗳️ Poll: ${poll.name}`;
          try {
            let secretBase64 = null;
            const secretBuf = sentMsg?.message?.messageContextInfo?.messageSecret;
            if (secretBuf) {
              secretBase64 = Buffer.from(secretBuf).toString('base64');
            }
            const fullMsgJson = sentMsg?.message ? JSON.stringify(sentMsg.message) : null;
            db.prepare(`
              INSERT INTO whatsapp_polls (message_id, remote_jid, poll_name, poll_options, message_secret, full_message_json, tenant_id, order_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(message_id) DO NOTHING
            `).run(messageId, jid, poll.name, JSON.stringify(poll.values), secretBase64, fullMsgJson, this.tenantId || 'default', orderId);
            console.log(`🗄️ [PollVault] [DIRECT] Persisted poll "${poll.name}" (id=${messageId}) to DB with secret and full message JSON for crash resilience.`);
          } catch (vaultErr) {
            console.error('⚠️ [PollVault] [DIRECT] Failed to persist poll to DB:', vaultErr.message);
          }
        } else if (payload.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select' || payload.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select') {
          dbMessageContent = payload.interactiveMessage?.body?.text || payload.viewOnceMessage?.message?.interactiveMessage?.body?.text || 'Interactive List';
        } else {
          dbMessageContent = mediaUrl ? `[${finalMediaType.toUpperCase()}] ${finalMessage || ''}` : finalMessage;
        }
        
        let finalDbMediaUrl = mediaUrl;
        if (finalDbMediaUrl && typeof finalDbMediaUrl === 'string' && !finalDbMediaUrl.startsWith('http') && !finalDbMediaUrl.startsWith('blob:')) {
          const publicIndex = finalDbMediaUrl.indexOf('/public/');
          if (publicIndex !== -1) {
            finalDbMediaUrl = finalDbMediaUrl.substring(publicIndex + 7);
          } else {
            const uploadsIndex = finalDbMediaUrl.indexOf('/uploads/');
            if (uploadsIndex !== -1) {
              finalDbMediaUrl = finalDbMediaUrl.substring(uploadsIndex);
            }
          }
        }

        let existingRow = null;
        if (uuid) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND message_id = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, uuid, this.tenantId);
        }
        if (!existingRow && finalDbMediaUrl) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, finalDbMediaUrl, this.tenantId);
        }

        if (existingRow) {
          db.prepare(`
            UPDATE whatsapp_messages 
            SET message_id = ?, status = 'sent'
            WHERE id = ?
          `).run(messageId, existingRow.id);
          dbMessageId = existingRow.id;
        } else {
          const result = db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
            VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?)
          `).run(storeId, orderId, cleaned, dbMessageContent, messageId, finalDbMediaUrl, finalMediaType, this.tenantId);
          dbMessageId = result.lastInsertRowid;
        }

        try {
          const { broadcast } = require('../websocket');
          broadcast('message', {
            order_id: orderId,
            message: {
              id: dbMessageId || Date.now(),
              store_id: storeId,
              order_id: orderId,
              phone: cleaned,
              direction: 'outgoing',
              message: dbMessageContent,
              message_id: messageId,
              clientUuid: uuid,
              media_url: finalDbMediaUrl,
              media_type: finalMediaType,
              status: 'sent',
              quote_context: quoteContext ? JSON.stringify(quoteContext) : null,
              created_at: new Date().toISOString()
            }
          });
        } catch (e) {}
      } catch (dbErr) {
        console.error('⚠️ DB insert/update failed in directSendMessage:', dbErr.message);
      }

      return { success: true, messageId: uuid };
    } catch (err) {
      const reason = err.message || 'Unknown WhatsApp error';
      console.error('❌ directSendMessage error:', reason);
      try {
        const { logSystemError } = require('../db');
        logSystemError('ERROR', `[directSendMessage] Failed to send directly to +${cleaned || phone}: ${reason}`, 'whatsapp_bot');
      } catch (_) {}
      this._addAuditLog(cleaned || phone, 'Failed', reason);

      // Log failure to DB & broadcast via WebSocket
      const { db } = require('../db');
      try {
        let dbMessageContent;
        if (poll) {
          dbMessageContent = pollMessageText || `🗳️ Poll: ${poll.name}`;
        } else if (payload?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select' || payload?.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select') {
          dbMessageContent = payload.interactiveMessage?.body?.text || payload.viewOnceMessage?.message?.interactiveMessage?.body?.text || 'Interactive List';
        } else {
          dbMessageContent = mediaUrl ? `[${finalMediaType.toUpperCase()}] ${finalMessage || ''}` : finalMessage;
        }

        let finalDbMediaUrl = mediaUrl;
        if (finalDbMediaUrl && typeof finalDbMediaUrl === 'string' && !finalDbMediaUrl.startsWith('http') && !finalDbMediaUrl.startsWith('blob:')) {
          const publicIndex = finalDbMediaUrl.indexOf('/public/');
          if (publicIndex !== -1) {
            finalDbMediaUrl = finalDbMediaUrl.substring(publicIndex + 7);
          } else {
            const uploadsIndex = finalDbMediaUrl.indexOf('/uploads/');
            if (uploadsIndex !== -1) {
              finalDbMediaUrl = finalDbMediaUrl.substring(uploadsIndex);
            }
          }
        }

        let existingRow = null;
        if (uuid) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND message_id = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, uuid, this.tenantId);
        }
        if (!existingRow && finalDbMediaUrl) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, finalDbMediaUrl, this.tenantId);
        }

        if (existingRow) {
          db.prepare(`
            UPDATE whatsapp_messages 
            SET message_id = ?, status = 'failed'
            WHERE id = ?
          `).run(uuid, existingRow.id);
        } else {
          db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
            VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'failed', ?)
          `).run(storeId, orderId, cleaned, dbMessageContent, uuid, finalDbMediaUrl, finalMediaType, this.tenantId);
        }

        try {
          const { broadcast } = require('../websocket');
          broadcast('message', {
            order_id: orderId,
            message: {
              id: Date.now(),
              store_id: storeId,
              order_id: orderId,
              phone: cleaned,
              direction: 'outgoing',
              message: dbMessageContent,
              message_id: uuid,
              clientUuid: uuid,
              media_url: finalDbMediaUrl,
              media_type: finalMediaType,
              status: 'failed',
              created_at: new Date().toISOString()
            }
          });
        } catch (e) {}
      } catch (dbErr) {
        console.error('Failed to log failed message status in DB (directSendMessage):', dbErr.message);
      }

      throw err;
    }
  }

  /**
   * Enqueues an outgoing message, routing immediately if manual/forced,
   * otherwise inserting it into priority or bulk anti-ban pacing queues.
   * 
   * @param {string} phone - Recipient phone number
   * @param {string} message - Text body
   * @param {boolean} [isManual=false] - Manual override flag
   * @param {string} [mediaUrl=null] - Media file URL
   * @param {string} [mediaType=null] - Media classification type
   * @param {string} [fileName=null] - Custom file descriptor name
   * @param {string} [customMessageId=null] - Local message tracking UUID
   * @param {object} [quoteContext=null] - Message context to quote
   * @param {object} [buttons=null] - Dynamic response buttons
   * @param {string} [buttonsMode='native'] - Button renderer protocol
   * @param {object} [poll=null] - Poll structure configuration
   * @param {object} [options={}] - Optional request attributes
   * @returns {Promise<object>} Promise resolving to transaction results
   */
  async sendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null, buttons = null, buttonsMode = 'native', poll = null, options = {}) {
    if (isManual || options?.force) {
      console.log(`⚡ [DIRECT_SEND_ROUTING] Manual/forced message to ${phone}. Routing directly to directSendMessage.`);
      return this.directSendMessage(phone, message, isManual, mediaUrl, mediaType, fileName, customMessageId, quoteContext, buttons, buttonsMode, poll, options);
    }

    if (!isManual) {
      try {
        const { db } = require('../db');
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
        else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

        const profile = db.prepare('SELECT opted_out FROM customer_profiles WHERE phone = ?').get(cleaned);
        if (profile && profile.opted_out === 1) {
          console.log(`🔕 Skipping automated sendMessage to ${cleaned} because customer has opted out.`);
          return { success: false, error: 'Customer has opted out of automated WhatsApp messages.' };
        }
      } catch (e) {
        console.error('⚠️ Opt-out pre-check failed:', e.message);
      }
    }

    let finalMessage = message;
    if (!isManual && finalMessage) {
      finalMessage = this.variateTemplateMessage(finalMessage);
    }

    const uuid = customMessageId || require('crypto').randomUUID();

    return new Promise((resolve) => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      const isActiveChatSession = this.activeChats.has(cleaned) || this.activeChats.has(phone);
      const item = { phone, message: finalMessage, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext, buttons, buttonsMode, poll, fastSend: options?.fastSend || false, options };

      if (isActiveChatSession) {
        this.priorityQueue.push(item);
        console.log(`⚡ [PRIORITY_QUEUE] Message queued for ${phone} (active session). Priority size: ${this.priorityQueue.length} | Bulk size: ${this.queue.length}`);
      } else {
        this.queue.push(item);
        console.log(`📥 [BULK_QUEUE] Message queued for ${phone}. Priority size: ${this.priorityQueue.length} | Bulk size: ${this.queue.length}`);
      }
      this._processQueue();
    });
  }

  /**
   * Invokes queue execution handlers within the active tenant execution context.
   * 
   * @returns {Promise<void>}
   */
  async _processQueue() {
    try {
      await tenantContext.run(this.tenantId, async () => {
        await processQueue(this, this.sock, db);
      });
    } catch (err) {
      console.error(`❌ [_processQueue] Error for tenant [${this.tenantId}]:`, err.message);
    }
  }

  /**
   * Periodically cleans up stale state tracking caches (cooldowns, rate metrics)
   * to avoid continuous memory growth.
   * 
   * @private
   * @returns {void}
   */
  _cleanOldStates() {
    const now = Date.now();
    
    // Clean humanCooldowns (older than 24 hours)
    for (const phone in this.humanCooldowns) {
      if (now - this.humanCooldowns[phone] > 24 * 3600 * 1000) {
        delete this.humanCooldowns[phone];
      }
    }
    
    // Clean contactMessageTimestamps (older than 24 hours)
    for (const phone in this.contactMessageTimestamps) {
      this.contactMessageTimestamps[phone] = (this.contactMessageTimestamps[phone] || []).filter(t => now - t < 24 * 3600 * 1000);
      if (this.contactMessageTimestamps[phone].length === 0) {
        delete this.contactMessageTimestamps[phone];
      }
    }
    
    // Clean contactLastIncomingTimestamp (older than 24 hours)
    for (const phone in this.contactLastIncomingTimestamp) {
      if (now - this.contactLastIncomingTimestamp[phone] > 24 * 3600 * 1000) {
        delete this.contactLastIncomingTimestamp[phone];
      }
    }
    
    // Clean consecutiveBotReplies if size grows too large
    const replyKeys = Object.keys(this.consecutiveBotReplies);
    if (replyKeys.length > 1000) {
      for (const phone of replyKeys) {
        if (!this.activeChats.has(phone)) {
          delete this.consecutiveBotReplies[phone];
        }
      }
    }
  }

  /**
   * Appends an audit check item to the rolling log buffers.
   * 
   * @private
   * @param {string} phone - Checked phone number
   * @param {string} status - Verification status tag
   * @param {string} [error] - Associated error text, if any
   * @returns {void}
   */
  _addAuditLog(phone, status, error) {
    this.auditLogs.unshift({
      time: new Date().toLocaleTimeString(),
      phone,
      status,
      error
    });
    if (this.auditLogs.length > 100) this.auditLogs.pop();
  }

  /**
   * Configures human intervention flag to pause bot responses for a specific phone contact.
   * 
   * @param {string} phone - Recipient phone number
   * @param {boolean} active - Status of human intervention mode
   * @returns {void}
   */
  setHumanHandoff(phone, active) {
    const normalized = normalizePhone(phone);
    if (!this.humanHandoffContacts) this.humanHandoffContacts = new Set();
    if (active) {
      this.humanHandoffContacts.add(normalized);
      console.log(`🧑 Human handoff ACTIVE for ${normalized}`);
    } else {
      this.humanHandoffContacts.delete(normalized);
      console.log(`🤖 Human handoff REMOVED for ${normalized}`);
    }
  }

  /**
   * Instantly enqueues an automated payment verification confirmation reply template.
   * 
   * @param {string} phone - Destination phone number
   * @param {number|string} orderId - Associated ERP order database identifier
   * @returns {void}
   */
  triggerPaymentReceivedReply(phone, orderId) {
    const normalized = normalizePhone(phone);
    if (this.processingReplies && this.processingReplies.has(normalized)) {
      console.warn(`🔒 CONCURRENT_LOCK: triggerPaymentReceivedReply already processing for ${normalized}. Skipping duplicate.`);
      return;
    }
    if (this.processingReplies) this.processingReplies.add(normalized);

    const msg = `✅ *Payment Confirmed!*\n\nThank you! We have received your payment for order *#${orderId}*. Your parcel is being packed and will be dispatched shortly. 📦\n\n_TRACE ERP Auto-Verification System_`;

    if (!msg || msg.trim() === '') {
      console.error('🚫 BLANK_MSG_BLOCKED: triggerPaymentReceivedReply generated empty message');
      if (this.processingReplies) this.processingReplies.delete(normalized);
      return;
    }

    this.sendMessage(phone, msg, false)
      .finally(() => {
        if (this.processingReplies) this.processingReplies.delete(phone);
      });
    console.log(`💳 PAYMENT_RECEIVED auto-reply queued for ${phone} for order #${orderId}`);
  }

  /**
   * Dynamically updates session throttle properties, delay ceilings, and template contexts.
   * 
   * @param {object} settings - Map of settings updates
   * @param {number} settings.minDelaySec - Minimal message delay pacing seconds
   * @param {number} settings.maxDelaySec - Maximal message delay pacing seconds
   * @param {number} settings.maxPerHour - Hourly dispatch limit threshold
   * @param {number} settings.coolingPeriodMin - Session sleep recovery threshold minutes
   * @param {number} settings.aiResponderEnabled - Boolean responder enabled flag
   * @param {string} settings.aiTrackingTemplate - Active tracking response content
   * @param {string} settings.aiLandmarkTemplate - Active landmark lookup query content
   * @returns {void}
   */
  setSettings({ minDelaySec, maxDelaySec, maxPerHour, coolingPeriodMin, aiResponderEnabled, aiTrackingTemplate, aiLandmarkTemplate }) {
    if (minDelaySec !== undefined) this.minDelaySec = Number(minDelaySec);
    if (maxDelaySec !== undefined) this.maxDelaySec = Number(maxDelaySec);
    if (maxPerHour !== undefined) this.maxPerHour = Number(maxPerHour);
    if (coolingPeriodMin !== undefined) this.coolingPeriodMin = Number(coolingPeriodMin);
    if (aiResponderEnabled !== undefined) this.aiResponderEnabled = Number(aiResponderEnabled);
    if (aiTrackingTemplate !== undefined) this.aiTrackingTemplate = aiTrackingTemplate;
    if (aiLandmarkTemplate !== undefined) this.aiLandmarkTemplate = aiLandmarkTemplate;
    console.log(`🎛️ Bot pacing & AI updated: ${this.minDelaySec}-${this.maxDelaySec}s delay | max ${this.maxPerHour}/hr | cooling ${this.coolingPeriodMin}m | AI Responder: ${this.aiResponderEnabled}`);
  }

  /**
   * Emergency master switch callback. Toggles active execution of queue processing.
   * 
   * @returns {boolean} Current queue pause state
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    console.log(`🎛️ Master Emergency Switch: isPaused = ${this.isPaused}`);
    if (!this.isPaused) {
      this._processQueue();
    }
    return this.isPaused;
  }

  /**
   * Purges pending outbound queues.
   * 
   * @returns {number} Count of purged items
   */
  clearQueue() {
    const bulkCount = this.queue.length;
    const priorityCount = this.priorityQueue?.length || 0;
    this.queue = [];
    if (this.priorityQueue) this.priorityQueue = [];
    console.log(`🗑️ Cleared ${bulkCount} bulk + ${priorityCount} priority queued messages.`);
    return bulkCount + priorityCount;
  }

  /**
   * Computes a snapshot containing bottleneck states, queues list sizes, and configuration limits.
   * 
   * @returns {object} Queue state parameters structure
   */
  getQueueDetails() {
    const bottleneck = this.status !== 'CONNECTED' ? 'WAITING_SOCKET'
      : this.isPaused ? 'WAITING_QUEUE'
      : this.isSleeping ? 'SLEEPING'
      : 'RUNNING';
    return {
      isPaused: this.isPaused,
      isSleeping: this.isSleeping,
      bottleneck,
      priorityQueueCount: this.priorityQueue?.length || 0,
      bulkQueueCount: this.queue.length,
      queueCount: (this.priorityQueue?.length || 0) + this.queue.length,
      activeChatsCount: this.activeChats?.size || 0,
      hourlyCount: this.hourlyCount,
      maxPerHour: this.maxPerHour,
      minDelaySec: this.minDelaySec,
      maxDelaySec: this.maxDelaySec,
      coolingPeriodMin: this.coolingPeriodMin,
      auditLogs: this.auditLogs
    };
  }

  /**
   * Resets active credentials and reconnects bot socket.
   * 
   * @returns {Promise<void>}
   */
  async resetSession() {
    return sessionManager.resetSession(this);
  }

  /**
   * Disconnects current socket and logs out WhatsApp credentials store.
   * 
   * @returns {Promise<void>}
   */
  async logoutSession() {
    return sessionManager.logoutSession(this);
  }

  /**
   * Triggers a soft reconnection to WhatsApp network.
   * 
   * @returns {Promise<void>}
   */
  async softReconnect() {
    return sessionManager.softReconnect(this);
  }

  /**
   * Retrieves active chat logs in memory.
   * 
   * @param {string} phone - Contact target phone number
   * @returns {Array<object>} Processed messages history array
   */
  getChatHistory(phone) {
    return eventRouter.getChatHistory(this, phone);
  }

  /**
   * Retrieves full chat message log segments from server history.
   * 
   * @param {string} phone - Contact target phone number
   * @returns {Promise<object>} Status code wrapper containing messages array
   */
  async fetchHistoryForPhone(phone) {
    return eventRouter.fetchHistoryForPhone(this, phone);
  }

  /**
   * Resolves connection sync pipelines.
   * 
   * @returns {Promise<void>}
   */
  async syncDeepHistory() {
    return eventRouter.syncDeepHistory(this);
  }

  /**
   * Checks connection status value.
   * 
   * @returns {boolean} True if Bot is currently connected
   */
  isOnline() {
    return this.status === 'CONNECTED';
  }

  /**
   * Resolves current connection state fields, QR codes string, and active identity mapping.
   * 
   * @returns {object} Identity status parameters
   */
  getStatus() {
    let activeNumber = this.activeNumber || null;
    if (!activeNumber && this.status === 'CONNECTED') {
      try {
        const rawId = this.sock?.user?.id || '';
        const digits = rawId.split(':')[0].split('@')[0];
        if (digits) {
          activeNumber = `+${digits}`;
          this.activeNumber = activeNumber;
        }
      } catch (_) {}
    }
    return {
      status: this.status,
      qrCode: this.qrCode,
      reconnectAttempts: this.reconnectAttempts,
      activeNumber,
    };
  }
}

const sessions = new Map();

/**
 * Resolves or creates a session instance for the given tenant ID.
 * 
 * @param {string} [tenantId='default'] - Partition tenant identifier
 * @returns {WhatsAppBot} A partitioning session instance
 */
function getBotInstance(tenantId = 'default') {
  if (!sessions.has(tenantId)) {
    sessions.set(tenantId, new WhatsAppBot(tenantId));
  }
  return sessions.get(tenantId);
}

if (isProduction) {
  getBotInstance('default');
}

const botProxy = new Proxy({}, {
  get(target, prop) {
    const tenantId = tenantContext.getStore() || 'default';
    const instance = getBotInstance(tenantId);
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(target, prop, value) {
    const tenantId = tenantContext.getStore() || 'default';
    const instance = getBotInstance(tenantId);
    instance[prop] = value;
    return true;
  }
});

module.exports = botProxy;
module.exports.sessions = sessions;

/**
 * Resolves the primary session instance for a given tenant.
 * 
 * @param {string} tenantId - Partition tenant identifier
 * @returns {WhatsAppBot} WhatsApp bot instance mapping
 */
module.exports.getBot = function(tenantId) {
  return getBotInstance(tenantId || 'default');
};
