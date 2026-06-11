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

class WhatsAppBot {
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

    setTimeout(() => this._connect(), 5000);
  }

  getSessionPath() {
    return sessionManager.getSessionPath(this);
  }

  _scheduleReconnect() {
    return sessionManager._scheduleReconnect(this);
  }

  async _connect() {
    return sessionManager.connectBot(this);
  }

  async _clearSessionStore() {
    return sessionManager._clearSessionStore(this);
  }

  async _wipeCreds() {
    return sessionManager._wipeCreds(this);
  }

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

  async directSendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null, buttons = null, buttonsMode = 'native', poll = null, options = {}) {
    await this.ensureConnected();

    const cleaned = normalizePhone(phone);
    const jid = cleaned + '@s.whatsapp.net';
    const uuid = customMessageId || require('crypto').randomUUID();

    const { db } = require('../db');
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
        payload = {
          poll: {
            name: poll.name,
            values: poll.values,
            selectableCount: poll.selectableCount || 1
          }
        };
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
        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
        const orderId = order ? order.id : null;
        const storeId = order ? order.store_id : 1;
        
        let dbMessageContent;
        if (poll) {
          dbMessageContent = `🗳️ Poll: ${poll.name}`;
          try {
            let secretHex = null;
            const secretBuf = sentMsg?.message?.messageContextInfo?.messageSecret;
            if (secretBuf) {
              secretHex = Buffer.from(secretBuf).toString('hex');
            }
            db.prepare(`
              INSERT INTO whatsapp_polls (message_id, remote_jid, poll_name, poll_options, message_secret, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(message_id) DO NOTHING
            `).run(messageId, jid, poll.name, JSON.stringify(poll.values), secretHex, this.tenantId || 'default');
            console.log(`🗄️ [PollVault] [DIRECT] Persisted poll "${poll.name}" (id=${messageId}) to DB with secret for crash resilience.`);
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
        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
        const orderId = order ? order.id : null;
        const storeId = order ? order.store_id : 1;
        
        let dbMessageContent;
        if (poll) {
          dbMessageContent = `🗳️ Poll: ${poll.name}`;
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
      const item = { phone, message: finalMessage, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext, buttons, buttonsMode, poll, fastSend: options?.fastSend || false };

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

  async _processQueue() {
    try {
      await tenantContext.run(this.tenantId, async () => {
        await processQueue(this, this.sock, db);
      });
    } catch (err) {
      console.error(`❌ [_processQueue] Error for tenant [${this.tenantId}]:`, err.message);
    }
  }

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

  _addAuditLog(phone, status, error) {
    this.auditLogs.unshift({
      time: new Date().toLocaleTimeString(),
      phone,
      status,
      error
    });
    if (this.auditLogs.length > 100) this.auditLogs.pop();
  }

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

  togglePause() {
    this.isPaused = !this.isPaused;
    console.log(`🎛️ Master Emergency Switch: isPaused = ${this.isPaused}`);
    if (!this.isPaused) {
      this._processQueue();
    }
    return this.isPaused;
  }

  clearQueue() {
    const bulkCount = this.queue.length;
    const priorityCount = this.priorityQueue?.length || 0;
    this.queue = [];
    if (this.priorityQueue) this.priorityQueue = [];
    console.log(`🗑️ Cleared ${bulkCount} bulk + ${priorityCount} priority queued messages.`);
    return bulkCount + priorityCount;
  }

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

  async resetSession() {
    return sessionManager.resetSession(this);
  }

  async logoutSession() {
    return sessionManager.logoutSession(this);
  }

  async softReconnect() {
    return sessionManager.softReconnect(this);
  }

  getChatHistory(phone) {
    return eventRouter.getChatHistory(this, phone);
  }

  async fetchHistoryForPhone(phone) {
    return eventRouter.fetchHistoryForPhone(this, phone);
  }

  async syncDeepHistory() {
    return eventRouter.syncDeepHistory(this);
  }

  isOnline() {
    return this.status === 'CONNECTED';
  }

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

module.exports.getBot = function(tenantId) {
  return getBotInstance(tenantId || 'default');
};
