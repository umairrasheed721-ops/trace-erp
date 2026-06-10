const path = require('path');
const fs = require('fs');

const {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  adaptiveStrategy
} = require('./processors/replyFormatter');

const {
  saveMediaFile,
  handleAudioTranscode
} = require('./processors/mediaHandler');

const {
  analyzeCustomerIntent,
  handleIncomingAIMessage
} = require('./processors/aiDispatcher');

async function processQueue(bot, sock, db) {
  const totalPending = (bot.priorityQueue?.length || 0) + bot.queue.length;
  if (bot.isProcessing || totalPending === 0) return;

  if (bot.status !== 'CONNECTED') {
    console.warn(`⏳ [WAITING_SOCKET] Bot not connected. Priority pending: ${bot.priorityQueue?.length || 0} | Bulk pending: ${bot.queue.length}`);
    return;
  }
  if (bot.isPaused) {
    console.warn(`⏳ [WAITING_QUEUE] Queue paused by Master Emergency Switch. Items frozen: ${totalPending}`);
    return;
  }
  if (bot.isSleeping) {
    console.warn(`⏳ [WAITING_QUEUE] Bot SLEEPING until ${new Date(bot.sleepUntil).toISOString()}. Items frozen: ${totalPending}`);
    return;
  }

  bot.isProcessing = true;

  try {
    while ((!bot.isPaused && !bot.isSleeping) && ((bot.priorityQueue?.length || 0) + bot.queue.length > 0)) {
      const activeQueue = (bot.priorityQueue?.length > 0) ? bot.priorityQueue : bot.queue;
      const queueType = (activeQueue === bot.priorityQueue) ? 'PRIORITY' : 'BULK';
      
      const now = Date.now();
      if (now - bot.lastResetTime > 3600000) {
        bot.hourlyCount = 0;
        bot.lastResetTime = now;
      }

      if (bot.hourlyCount >= bot.maxPerHour) {
        console.warn(`🛑 [WAITING_QUEUE] Hourly limit (${bot.maxPerHour}) reached. Cooling for ${bot.coolingPeriodMin} min. Pending: ${(bot.priorityQueue?.length || 0) + bot.queue.length}`);
        await new Promise(r => setTimeout(r, bot.coolingPeriodMin * 60000));
        bot.hourlyCount = 0;
        bot.lastResetTime = Date.now();
      }

      const queueItem = activeQueue[0];
      const adaptedItem = adaptiveStrategy(queueItem.phone, queueItem, db, queueItem.isManual);
      const { phone, message, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext, buttons, buttonsMode, poll, fastSend } = adaptedItem;
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      const sixtySecsAgo = Date.now() - 60000;
      bot.contactMessageTimestamps[cleaned] = (bot.contactMessageTimestamps[cleaned] || []).filter(t => t > sixtySecsAgo);
      
      const lastIncoming = bot.contactLastIncomingTimestamp[cleaned] || 0;
      const sentTimestamps = bot.contactMessageTimestamps[cleaned];
      
      if (sentTimestamps.length >= 3) {
        const lastSent = Math.max(...sentTimestamps);
        if (lastIncoming <= lastSent) {
          const oldestTimestamp = sentTimestamps[0];
          const waitTime = Math.max(1000, 60000 - (Date.now() - oldestTimestamp) + 1000);
          console.warn(`🛑 [WAITING_QUEUE] Anti-Ban: +${cleaned} limit reached (3 msgs/60s). Wait: ${(waitTime/1000).toFixed(1)}s | Queue type: ${queueType}`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
      }

      activeQueue.shift();
      console.log(`🚀 [${queueType}] Processing message for ${phone}. Priority remaining: ${bot.priorityQueue?.length || 0} | Bulk remaining: ${bot.queue.length}`);

      if (!isManual) {
        const dedupKey = `${normalizePhone(cleaned)}:${String(message).substring(0, 60)}`;
        const lastSentTs = bot.sentMessages.get(dedupKey);
        if (lastSentTs && (Date.now() - lastSentTs) < 5000) {
          console.warn(`🔒 DEDUP_LOCK: Blocked duplicate auto-reply to ${cleaned} within 5s window. Skipping.`);
          resolve({ success: false, error: 'DEDUP_BLOCKED' });
          continue;
        }
        bot.sentMessages.set(dedupKey, Date.now());
        if (bot.sentMessages.size > 200) {
          const oldestKey = bot.sentMessages.keys().next().value;
          bot.sentMessages.delete(oldestKey);
        }
      }

      if (!isManual) {
        bot.consecutiveBulkSentCount++;
        if (bot.consecutiveBulkSentCount >= 5) {
          bot.consecutiveBulkSentCount = 0;
          const restInterval = Math.floor(Math.random() * 60000) + 60000;
          console.log(`⏳ Anti-Ban Batch Stagger: Sent 5 bulk messages. Resting queue for ${restInterval/1000}s...`);
          await new Promise(r => setTimeout(r, restInterval));
        }
      }

      let dbMediaUrl = mediaUrl;
      let pendingAckPath = null;
      
      if (mediaUrl) {
        const pendingAckDir = path.resolve(__dirname, '..', 'pending_ack');
        if (!fs.existsSync(pendingAckDir)) {
          fs.mkdirSync(pendingAckDir, { recursive: true });
        }
        const ext = path.extname(mediaUrl) || (mediaType === 'document' ? '.pdf' : mediaType === 'video' ? '.mp4' : mediaType === 'image' ? '.jpg' : '.ogg');
        pendingAckPath = path.join(pendingAckDir, `${uuid}${ext}`);
        
        try {
          if (mediaType !== 'audio' && mediaType !== 'voice') {
            if (mediaUrl.startsWith('http')) {
              const fetch = require('node-fetch');
              const res = await fetch(mediaUrl);
              const buffer = await res.buffer();
              fs.writeFileSync(pendingAckPath, buffer);
            } else {
              const { getSecureMediaPath } = require('./processors/mediaHandler');
              const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(mediaUrl) ? mediaUrl : null);
              if (resolvedPath) {
                fs.copyFileSync(resolvedPath, pendingAckPath);
              }
            }
            console.log(`[PENDING_ACK] Saved outgoing media copy to: ${pendingAckPath}`);
          }
        } catch (err) {
          console.error('⚠️ Failed to save pending_ack media file:', err.message);
        }
      }

      try {
        const jid = cleaned + '@s.whatsapp.net';
        
        if (fastSend) {
          console.log(`⚡ [FAST_SEND] Fast album dispatch to ${cleaned}. Delay: 800ms`);
          await new Promise(r => setTimeout(r, 800));
        } else if (isManual) {
          console.log(`⚡ [PRIORITY] Manual agent message to ${cleaned}. No anti-ban delay.`);
          await new Promise(r => setTimeout(r, 300));
        } else if (isActiveChatSession) {
          const smartDelay = Math.floor(Math.random() * 1000) + 2000;
          console.log(`⚡ [SMART_BACKOFF] Active chat session for ${cleaned}. Delay: ${(smartDelay/1000).toFixed(1)}s (vs bulk ${bot.minDelaySec}-${bot.maxDelaySec}s)`);
          await new Promise(r => setTimeout(r, smartDelay));
        } else {
          const minMs = (bot.minDelaySec || 5) * 1000;
          const maxMs = (bot.maxDelaySec || 15) * 1000;
          const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
          console.log(`⏳ [BULK_THROTTLE] Anti-Ban spacing: ${(delay/1000).toFixed(1)}s before sending to ${cleaned}. Bulk queue: ${bot.queue.length}`);
          await new Promise(r => setTimeout(r, delay));

          try {
            const [reg] = await sock.onWhatsApp(jid);
            if (!reg?.exists) {
              const reason = `+${cleaned} is not registered on WhatsApp`;
              bot._addAuditLog(cleaned, 'Failed', reason);
              resolve({ success: false, error: reason });
              continue;
            }
          } catch(e) {
            console.warn(`⚠️ onWhatsApp check failed/rate-limited for ${cleaned}, proceeding anyway...`);
          }
        }

        if (!mediaUrl) {
          const earlyCheck = String(message || '').trim();
          if (!earlyCheck) {
            console.error('🚫 BLANK_MSG_BLOCKED: Empty message detected before API call. Skipping.', { phone: cleaned });
            resolve({ success: false, error: 'BLANK_MSG_BLOCKED' });
            continue;
          }
        }

        try {
          await sock.sendPresenceUpdate('composing', jid);
        } catch (e) {}

        const charDelay = (message || '').length * 50;
        const jitterFraction = (Math.random() * 0.4) - 0.2;
        const jitter = charDelay * jitterFraction;
        const typingCap = (isManual || isActiveChatSession) ? 3000 : 15000;
        const typingFloor = (isManual || isActiveChatSession) ? 500 : 1000;
        const typingDelay = fastSend ? 0 : Math.max(typingFloor, Math.min(charDelay + jitter, typingCap));
        if (typingDelay > 0) {
          console.log(`💬 [TYPING_SIM] ${isActiveChatSession ? 'Active' : 'Bulk'} | ${typingDelay}ms typing delay to ${cleaned}`);
          await new Promise(r => setTimeout(r, typingDelay));
        }

        try {
          await sock.sendPresenceUpdate('paused', jid);
        } catch (e) {}

        const safeSend = async (jid, payload) => {
          if (typeof payload === 'string') {
            payload = { text: payload };
          }
          if (!payload || typeof payload !== 'object') {
            console.error('[CRITICAL] Blocked null/non-object payload:', payload);
            return null;
          }
          const isTextPayload = !payload.image && !payload.audio && !payload.video && !payload.document && !payload.poll && !payload.viewOnceMessage && !payload.interactiveMessage;
          if (isTextPayload) {
            const txt = typeof payload.text === 'string' ? payload.text.trim() : '';
            if (!txt) {
              console.error('[CRITICAL] Blocked empty/malformed text payload:', JSON.stringify(payload));
              return null;
            }
            payload = { text: txt };
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

          const delays = [2000, 4000, 8000];
          let attempt = 0;

          if (bot._botSentIds) {
            bot._botSentIds.add(uuid);
          }
          const deleteTimeout = bot._botSentIds ? setTimeout(() => bot._botSentIds.delete(uuid), 30000) : null;

          while (true) {
            try {
              const options = { messageId: uuid };
              const sent = await sock.sendMessage(jid, payload, options);
              return sent;
            } catch (err) {
              attempt++;
              if (attempt > 3) {
                if (bot._botSentIds) {
                  bot._botSentIds.delete(uuid);
                }
                if (deleteTimeout) clearTimeout(deleteTimeout);
                throw err;
              }
              const delay = delays[attempt - 1];
              console.warn(`[RETRY] sendMessage failed for ${jid}, retry ${attempt}/3 in ${delay}ms. Error: ${err.message}`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        };

        let finalMediaType = mediaType;
        if (mediaUrl && !finalMediaType) {
          finalMediaType = 'image';
        }

        let sentMsg;
        const hasButtons = buttons && Array.isArray(buttons) && buttons.length > 0;

        if (poll) {
          const pollPayload = {
            poll: {
              name: poll.name,
              // values = the option strings shown to the customer (e.g. ['✅ Confirm', '❌ Cancel'])
              values: poll.values,
              selectableCount: poll.selectableCount || 1
            }
          };
          sentMsg = await safeSend(jid, pollPayload);

          // ── POLL VAULT: Write poll metadata to SQLite immediately after send ──
          //
          // WHY THIS EXISTS:
          // Baileys keeps all sent/received messages in bot.store.messages (in-memory only).
          // When the Railway container restarts, that memory is wiped.
          // If a customer votes on a poll that was sent BEFORE the restart,
          // bot.store has no record of it → syncPollVoteToShopify fails silently.
          //
          // FIX: Write poll.name + poll.values to the whatsapp_polls SQLite table right
          // after the poll is sent. This is our "Poll Vault" — a crash-proof backup.
          // When the in-memory store misses, we fall back to this table.
          //
          // ON CONFLICT DO NOTHING = safe if Baileys retries the send on reconnect.
          try {
            const vaultMsgId = sentMsg?.key?.id || uuid;
            db.prepare(`
              INSERT INTO whatsapp_polls (message_id, remote_jid, poll_name, poll_options, tenant_id)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(message_id) DO NOTHING
            `).run(vaultMsgId, jid, poll.name, JSON.stringify(poll.values), bot.tenantId || 'default');
            console.log(`🗄️ [PollVault] Persisted poll "${poll.name}" (id=${vaultMsgId}) to DB for crash resilience.`);
          } catch (vaultErr) {
            // Non-fatal: poll still sent successfully, vault write is best-effort
            console.error('⚠️ [PollVault] Failed to persist poll to DB:', vaultErr.message);
          }
        } else if (hasButtons && buttonsMode === 'text') {
          const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
          const listText = buttons.map((btn, idx) => {
            const emoji = numberEmojis[idx] || '🔘';
            return `${emoji} ${btn.label}`;
          }).join('\n');
          const textAppend = `\n\n${listText}`;

          if (mediaUrl) {
            const captionText = `${message || ''}${textAppend}`;
            if (finalMediaType === 'image') {
              sentMsg = await safeSend(jid, { image: { url: mediaUrl }, caption: captionText });
            } else if (finalMediaType === 'document') {
              sentMsg = await safeSend(jid, { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: captionText });
            } else if (finalMediaType === 'video') {
              sentMsg = await safeSend(jid, { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: captionText });
            } else {
              sentMsg = await safeSend(jid, { text: captionText });
            }
          } else {
            sentMsg = await safeSend(jid, { text: `${message || ''}${textAppend}` });
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
              body: { text: message || 'Please select an option:' },
              nativeFlowMessage: {
                buttons: nativeButtons
              }
            }
          };

          if (mediaUrl) {
            if (finalMediaType === 'image') {
              await safeSend(jid, { image: { url: mediaUrl }, caption: message || '' });
            } else if (finalMediaType === 'document') {
              await safeSend(jid, { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: message || '' });
            } else if (finalMediaType === 'video') {
              await safeSend(jid, { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: message || '' });
            }
            sentMsg = await safeSend(jid, interactivePayload);
          } else {
            sentMsg = await safeSend(jid, interactivePayload);
          }
        } else if (mediaType === 'list' && message && typeof message === 'object') {
          const listConfig = message;
          const interactivePayload = {
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
          sentMsg = await safeSend(jid, interactivePayload);
        } else {
          if (mediaUrl) {
            if (finalMediaType === 'image') {
              const payload = { image: { url: mediaUrl }, caption: message || '' };
              sentMsg = await safeSend(jid, payload);
            } else if (finalMediaType === 'document') {
              const payload = { 
                document: { url: mediaUrl }, 
                mimetype: 'application/pdf', 
                fileName: fileName || 'document.pdf', 
                caption: message || '' 
              };
              sentMsg = await safeSend(jid, payload);
            } else if (finalMediaType === 'audio' || finalMediaType === 'voice') {
              sentMsg = await handleAudioTranscode(mediaUrl, finalMediaType, pendingAckPath, safeSend, jid);
            } else if (finalMediaType === 'video') {
              const payload = { 
                video: { url: mediaUrl }, 
                mimetype: 'video/mp4', 
                caption: message || '' 
              };
              sentMsg = await safeSend(jid, payload);
            } else {
              sentMsg = await safeSend(jid, { text: String(message) });
            }
          } else {
            const textContent = String(message || '');
            if (!textContent || textContent.trim() === '') {
              console.error('🚫 BLANK_MSG_BLOCKED: Attempted to send empty text message to', cleaned);
              resolve({ success: false, error: 'BLANK_MSG_BLOCKED' });
              continue;
            }
            sentMsg = await safeSend(jid, { text: textContent });
          }
        }

        const messageId = sentMsg?.key?.id || uuid;
        if (bot._botSentIds && messageId !== uuid) {
          bot._botSentIds.add(messageId);
          setTimeout(() => {
            if (bot._botSentIds) bot._botSentIds.delete(messageId);
          }, 30000);
        }
        bot.hourlyCount++;
        console.log(`✉️ Sent to ${cleaned} (Total this hour: ${bot.hourlyCount})`);
        bot._addAuditLog(cleaned, 'Sent', '');

        bot.contactMessageTimestamps[cleaned] = bot.contactMessageTimestamps[cleaned] || [];
        bot.contactMessageTimestamps[cleaned].push(Date.now());

        if (!isManual) {
          bot.sentCountInSession++;
          if (bot.sentCountInSession >= bot.sleepThreshold) {
            bot.sentCountInSession = 0;
            bot.isSleeping = true;
            bot.status = 'SLEEPING';
            bot.sleepUntil = Date.now() + 15 * 60 * 1000;
            
            console.log(`💤 Bot instance [${bot.tenantId}] triggers mandatory 15-minute simulated human rest.`);
            
            try {
              db.prepare("UPDATE whatsapp_settings SET status = 'SLEEPING'").run();
            } catch(e){}

            setTimeout(() => {
              bot.isSleeping = false;
              bot.sleepUntil = null;
              bot.status = 'CONNECTED';
              try {
                db.prepare("UPDATE whatsapp_settings SET status = 'CONNECTED'").run();
              } catch(e){}
              console.log(`💤 Bot instance [${bot.tenantId}] woke up from simulated human rest.`);
              bot._processQueue();
            }, 15 * 60 * 1000);
          }
        }

        let dbMessageId = null;
        try {
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, bot.tenantId);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          const dbMessageContent = poll ? `🗳️ Poll: ${poll.name}` : (dbMediaUrl ? `[${finalMediaType.toUpperCase()}] ${message}` : message);
          
          let finalDbMediaUrl = dbMediaUrl;
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
            `).get(cleaned, uuid, bot.tenantId);
          }
          if (!existingRow && finalDbMediaUrl) {
            existingRow = db.prepare(`
              SELECT id FROM whatsapp_messages 
              WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
              ORDER BY id DESC LIMIT 1
            `).get(cleaned, finalDbMediaUrl, bot.tenantId);
          }

          if (existingRow) {
            db.prepare(`
              UPDATE whatsapp_messages 
              SET message_id = ?, status = 'sent'
              WHERE id = ?
            `).run(messageId, existingRow.id);
            dbMessageId = existingRow.id;
            console.log(`[DEDUP] Updated existing message ID ${dbMessageId} (originally message_id=${uuid}) with Baileys ID: ${messageId}`);
          } else {
            const result = db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
              VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?)
            `).run(storeId, orderId, cleaned, dbMessageContent, messageId, finalDbMediaUrl, finalMediaType, bot.tenantId);
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
          console.error('⚠️ DB insert failed in _processQueue:', dbErr.message);
        }

        resolve({ success: true });

      } catch (err) {
        const reason = err.message || 'Unknown WhatsApp error';
        console.error('❌ sendMessage error:', reason);
        try {
          const { logSystemError } = require('../db');
          logSystemError('ERROR', `[sendMessage] Failed to send to +${cleaned || phone}: ${reason}`, 'whatsapp_bot');
        } catch (_) {}
        bot._addAuditLog(cleaned || phone, 'Failed', reason);
        
        try {
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, bot.tenantId);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          const dbMessageContent = poll ? `🗳️ Poll: ${poll.name}` : (dbMediaUrl ? `[${finalMediaType.toUpperCase()}] ${message}` : message);

          let finalDbMediaUrl = dbMediaUrl;
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
          if (finalDbMediaUrl) {
            existingRow = db.prepare(`
              SELECT id FROM whatsapp_messages 
              WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
              ORDER BY id DESC LIMIT 1
            `).get(cleaned, finalDbMediaUrl, bot.tenantId);
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
            `).run(storeId, orderId, cleaned, dbMessageContent, uuid, finalDbMediaUrl, finalMediaType, bot.tenantId);
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
          console.error('Failed to log failed message status in DB:', dbErr.message);
        }

        if (pendingAckPath && fs.existsSync(pendingAckPath)) {
          try {
            fs.unlinkSync(pendingAckPath);
          } catch (e) {}
        }

        resolve({ success: false, error: reason });
      }
    }
  } catch (err) {
    console.error('❌ CRITICAL error in processQueue loop:', err.stack || err.message);
  } finally {
    bot.isProcessing = false;
  }
}

async function processIncomingMessage(bot, msg, sock, db) {
  if (!msg.message) return;
  
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter')) return;
  
  if (!bot.store.messages[remoteJid]) bot.store.messages[remoteJid] = [];
  bot.store.messages[remoteJid].push(msg);
  if (bot.store.messages[remoteJid].length > 100) bot.store.messages[remoteJid].shift();

  // Handle poll updates (votes) bypass fromMe trap
  if (msg.message?.pollUpdateMessage) {
    console.log(`🔍 [POLL_DIAG] ✅ STEP 1: pollUpdateMessage detected from JID: ${remoteJid}`);
    console.log(`🔍 [POLL_DIAG] bot exists: ${!!bot}, bot.tenantId: ${bot?.tenantId}, db exists: ${!!db}`);
    await syncPollVoteToShopify(bot, msg, db);
    return;
  }

  const fromPhone = getPhoneFromJid(msg, db);
  
  if (msg.message?.protocolMessage) {
    const protocolMsg = msg.message.protocolMessage;
    if (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE') {
      const deletedId = protocolMsg.key?.id;
      if (deletedId) {
        console.log(`🚫 Message deletion detected: message_id=${deletedId} was deleted.`);
        
        try {
          db.prepare(`
            UPDATE whatsapp_messages 
            SET message = '🚫 This message was deleted', media_url = NULL, media_type = NULL 
            WHERE message_id = ?
          `).run(deletedId);
        } catch (e) {
          console.error('Failed to update deleted message in DB:', e.message);
        }

        try {
          const { broadcast } = require('../websocket');
          broadcast('message_deleted', {
            message_id: deletedId,
            phone: fromPhone
          });
        } catch (e) {}
      }
    }
    return;
  }

  let text = getMessageText(msg);
  const mediaDetails = getMessageMediaDetails(msg);
  if (!text && !mediaDetails && !msg.message) return;

  const isOutgoing = msg.key.fromMe;
  const msgAgeMs = Date.now() - (Number(msg.messageTimestamp) * 1000);
  const isHistoric = msgAgeMs > 10 * 60 * 1000;

  let tag = 'General';
  if (!isOutgoing && !isHistoric && text) {
    tag = await analyzeCustomerIntent(text);
  }
  msg.intent_tag = tag;

  if (isHistoric && !isOutgoing) {
    console.log(`📜 [HISTORIC_SKIP] Ignoring old incoming message (${Math.round(msgAgeMs/1000)}s ago) from ${fromPhone}.`);
    return;
  }

  if (!isOutgoing && fromPhone) {
    bot.contactLastIncomingTimestamp[fromPhone] = Date.now();
    bot.activeChats.add(fromPhone);
    setTimeout(() => bot.activeChats.delete(fromPhone), 5 * 60 * 1000);
  }
  
  let mediaUrl = null;
  let mediaType = null;
  let driveFileId = null;
  if (mediaDetails) {
    const existingMsg = db.prepare(`SELECT media_url, drive_file_id FROM whatsapp_messages WHERE message_id = ?`).get(msg.key.id);
    if (existingMsg && existingMsg.media_url) {
      mediaUrl = existingMsg.media_url;
      mediaType = mediaDetails.type;
      driveFileId = existingMsg.drive_file_id || null;
    } else {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        mediaType = mediaDetails.type;
        const mediaResult = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
        if (mediaResult) {
          mediaUrl = mediaResult.url;
          driveFileId = mediaResult.id;
        }
      } catch (mediaErr) {
        console.error('⚠️ Media download error in messages.upsert:', mediaErr.message);
      }
    }
  }

  const msgKeys = Object.keys(msg.message || {});
  const SUPPORTED_TYPES = ['conversation', 'extendedTextMessage', 'imageMessage', 'audioMessage',
    'videoMessage', 'documentMessage', 'stickerMessage', 'reactionMessage',
    'protocolMessage', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
    'ptvMessage', 'locationMessage', 'contactMessage'];
  const hasKnownType = msgKeys.some(k => SUPPORTED_TYPES.includes(k));
  if (!hasKnownType && !text && !mediaDetails) {
    console.log(`[MSG_FILTER] Skipping unsupported protocol message from ${fromPhone}. Keys: ${msgKeys.join(',')}`);
    return;
  }
  const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : null);
  if (!finalMessage) return;

  const m = msg.message;
  const contextInfo = m?.extendedTextMessage?.contextInfo || 
                      m?.imageMessage?.contextInfo || 
                      m?.audioMessage?.contextInfo || 
                      m?.videoMessage?.contextInfo || 
                      m?.documentMessage?.contextInfo;
  let incomingQuoteContext = null;
  if (contextInfo && contextInfo.stanzaId) {
    incomingQuoteContext = {
      id: contextInfo.stanzaId,
      participant: contextInfo.participant,
      text: contextInfo.quotedMessage?.conversation || 
            contextInfo.quotedMessage?.extendedTextMessage?.text || 
            "Media"
    };
  }

  const order = db.prepare(`SELECT id, store_id, shopify_order_id FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
  const orderId = order ? order.id : null;
  const storeId = order ? order.store_id : 1;

  let dbMessageId = null;
  let alreadyExists = false;
  try {
    const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE message_id = ?').get(msg.key.id);
    if (existing) {
      alreadyExists = true;
      dbMessageId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, quote_context, intent, tenant_id, drive_file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)
      `).run(storeId, orderId, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaUrl, mediaType, incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null, tag, bot.tenantId || 'default', driveFileId);
      dbMessageId = result.lastInsertRowid;

      if (order && order.shopify_order_id) {
        try {
          const { broadcast } = require('../sse');
          broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
        } catch (e) {
          console.error('Failed to broadcast WhatsApp message order_updated:', e.message);
        }
      }
    }
  } catch (dbErr) {
    console.error('⚠️ DB Insert Failed for incoming message:', dbErr.message);
  }

  if (!isOutgoing || !alreadyExists) {
    try {
      const { broadcast } = require('../websocket');
      broadcast('message', {
        order_id: orderId,
        message: {
          id: dbMessageId || Date.now(),
          store_id: storeId,
          order_id: orderId,
          phone: fromPhone,
          direction: isOutgoing ? 'outgoing' : 'incoming',
          message: finalMessage,
          message_id: msg.key.id,
          media_url: mediaUrl,
          media_type: mediaType,
          status: 'sent',
          quote_context: incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null,
          created_at: new Date().toISOString(),
          intent_tag: tag,
          intent: tag
        }
      });
    } catch (e) {}
  }

  if (isOutgoing) {
    const isBotEcho = bot._botSentIds && bot._botSentIds.has(msg.key.id);
    if (isBotEcho) {
      bot._botSentIds.delete(msg.key.id);
    }
    return;
  }

  console.log(`💬 Incoming WA Message from ${fromPhone}: ${text}`);

  const HIGH_RISK_KEYWORDS = [
    'refund', 'complaint', 'fraud', 'cheat', 'scam', 'defective', 'damaged',
    'broken', 'wrong item', 'consumer court', 'worst service', 'bad service',
    'fake', 'wapas', 'shikayat', 'dhoka', 'kharab'
  ];
  const lowerText = String(text || '').toLowerCase().trim();
  const isHighRisk = HIGH_RISK_KEYWORDS.some(kw => lowerText.includes(kw));

  if (!isOutgoing && isHighRisk) {
    console.log(`⚠️ [TRIAGE] High-risk message intent detected from ${fromPhone}. Routing to triage queue.`);
    const until = Date.now() + 15 * 60 * 1000;
    try {
      db.prepare(`
        INSERT INTO customer_profiles (phone, risk_flag, risk_reason, risk_updated_at, human_handoff_until, updated_at)
        VALUES (?, 'HIGH_RISK', 'High-risk message intent: ' || ?, datetime('now'), ?, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET 
          risk_flag = 'HIGH_RISK', 
          risk_reason = 'High-risk message intent: ' || ?, 
          risk_updated_at = datetime('now'),
          human_handoff_until = ?,
          updated_at = datetime('now')
      `).run(fromPhone, text.substring(0, 100), String(until), text.substring(0, 100), String(until));
    } catch (e) {
      console.error('⚠️ Failed to update customer risk profile:', e.message);
    }
    
    bot.setHumanHandoff(fromPhone, true);
    
    try {
      const { broadcast } = require('../websocket');
      broadcast('high_risk_triage', { phone: fromPhone, message: text });
    } catch (_) {}

    try {
      db.prepare(`
        UPDATE whatsapp_messages SET intent = 'triage' WHERE message_id = ?
      `).run(msg.key.id);
    } catch (dbErr) {
      console.error('⚠️ DB update failed for triage message:', dbErr.message);
    }
    
    return;
  }

  if (bot.isSleeping) {
    console.log(`💤 Bot is currently SLEEPING (simulating rest) for tenant [${bot.tenantId}]. Skipping auto-reply to ${fromPhone}.`);
    return;
  }

  if (bot.humanHandoffContacts && bot.humanHandoffContacts.has(fromPhone)) {
    console.log(`👤 [HANDOFF] ${fromPhone} is in human intervention mode. Bot silent.`);
    return;
  }

  try {
    const profile = db.prepare('SELECT human_handoff_until FROM customer_profiles WHERE phone = ?').get(fromPhone);
    if (profile && profile.human_handoff_until) {
      const handoffUntil = Number(profile.human_handoff_until);
      if (Date.now() < handoffUntil) {
        console.log(`👤 [HANDOFF_DB_LOCK] ${fromPhone} has active human handoff lock until ${new Date(handoffUntil).toISOString()}. Bot silent.`);
        return;
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to check handoff lock in DB:', e.message);
  }

  bot.consecutiveBotReplies[fromPhone] = 0;

  const lastHumanMsg = bot.humanCooldowns[fromPhone];
  if (lastHumanMsg && (Date.now() - lastHumanMsg) < 2 * 60 * 1000) {
    console.log(`⏳ Skipping bot auto-reply for ${fromPhone} due to active human manual override (2 min cooldown).`);
    return;
  }

  try {
    const lastOutgoing = db.prepare(`
      SELECT message FROM whatsapp_messages 
      WHERE phone = ? AND direction = 'outgoing' 
      ORDER BY id DESC LIMIT 1
    `).get(fromPhone);

    if (lastOutgoing && lastOutgoing.message) {
      const outMsg = lastOutgoing.message;
      const optionLines = outMsg.split('\n').filter(line => line.includes('1️⃣') || line.includes('2️⃣') || line.includes('3️⃣') || line.includes('🔘'));
      
      if (optionLines.length > 0) {
        const replyText = text.toLowerCase().trim();
        let selectedOptionLabel = null;
        
        if (replyText === '1' || replyText.includes('1️⃣')) {
          const line1 = optionLines.find(l => l.includes('1️⃣') || l.startsWith('1'));
          if (line1) selectedOptionLabel = line1.replace(/1️⃣|1\s*[\.\-\)]/g, '').trim();
        } else if (replyText === '2' || replyText.includes('2️⃣')) {
          const line2 = optionLines.find(l => l.includes('2️⃣') || l.startsWith('2'));
          if (line2) selectedOptionLabel = line2.replace(/2️⃣|2\s*[\.\-\)]/g, '').trim();
        } else if (replyText === '3' || replyText.includes('3️⃣')) {
          const line3 = optionLines.find(l => l.includes('3️⃣') || l.startsWith('3'));
          if (line3) selectedOptionLabel = line3.replace(/3️⃣|3\s*[\.\-\)]/g, '').trim();
        }
        
        if (selectedOptionLabel) {
          console.log(`🔘 [KEY-PRESS INTERCEPT] Customer ${fromPhone} selected option: "${selectedOptionLabel}" via numeric reply.`);
          text = selectedOptionLabel;
        }
      }
    }

    const lowerTextVal = text.toLowerCase().trim();
    if (lowerTextVal.includes('speak to agent') || lowerTextVal.includes('talk to agent') || lowerTextVal === 'btn_agent' || lowerTextVal === 'agent') {
      console.log(`🧑 [BUTTON_HANDOFF] Intercepted speak-to-agent trigger for ${fromPhone}`);
      bot.setHumanHandoff(fromPhone, true);
      try {
        const { broadcast } = require('../websocket');
        broadcast('human_handoff_required', { phone: fromPhone, reason: 'Customer clicked Speak to Agent button', preview: 'Handoff requested' });
      } catch (_) {}
      bot.sendMessage(fromPhone, "Aapko support representative queue mein add kar diya gaya hai. Hamare agent jald hi aapse raabta karenge. Shukriya! 🙏", false);
      return;
    }

    if (lowerTextVal.includes('track order') || lowerTextVal === 'btn_track' || lowerTextVal === 'track') {
      console.log(`📦 [BUTTON_WISMO] Intercepted track-order trigger for ${fromPhone}`);
      text = 'track';
    }
  } catch (e) {
    console.error('⚠️ Interactive button reply interceptor error:', e.message);
  }

  try {
    const lowerText = text.toLowerCase().trim();
    const optOutKeywords = ['stop', 'unsubscribe', 'opt out', 'optout', 'bas karo', 'tang na karo', 'unsub'];
    const isOptOut = optOutKeywords.some(keyword => lowerText === keyword || lowerText.startsWith(keyword + ' '));
    
    if (isOptOut) {
      db.prepare(`
        INSERT INTO customer_profiles (phone, opted_out, updated_at)
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET opted_out = 1, updated_at = datetime('now')
      `).run(fromPhone);
      console.log(`🔕 Customer ${fromPhone} opted out from bot auto-replies.`);
      bot.sendMessage(fromPhone, "Aapko automated messages se unsubscribe kar diya gaya hai. Agar dobara updates active karni hon toh 'Start' reply karein. Shukriya!", false);
      return;
    }

    const optInKeywords = ['start', 'subscribe', 'opt in', 'optin', 'activate', 'dobara activate'];
    const isOptIn = optInKeywords.some(keyword => lowerText === keyword || lowerText.startsWith(keyword + ' '));
    
    if (isOptIn) {
      db.prepare(`
        INSERT INTO customer_profiles (phone, opted_out, updated_at)
        VALUES (?, 0, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET opted_out = 0, updated_at = datetime('now')
      `).run(fromPhone);
      console.log(`🔔 Customer ${fromPhone} opted in to bot auto-replies.`);
      bot.sendMessage(fromPhone, "Automated chat updates dobara active kar di gayi hain. Aapki kis tarah madad ki jaye?", false);
      return;
    }

    const profile = db.prepare('SELECT opted_out FROM customer_profiles WHERE phone = ?').get(fromPhone);
    if (profile && profile.opted_out === 1) {
      console.log(`🔕 Skipping bot reply for ${fromPhone} because customer is opted out.`);
      return;
    }

    await handleIncomingAIMessage(bot, text, fromPhone, sock, db);
  } catch (err) {
    console.error('❌ Error processing incoming WA message:', err.message);
  }
}

/**
 * syncPollVoteToShopify
 *
 * PURPOSE:
 * When a customer votes on a WhatsApp poll (e.g. "✅ Confirm Order"), this function:
 * 1. Decrypts which option they selected
 * 2. Maps it to a Shopify order tag (e.g. "Trace: Confirmed")
 * 3. Fires a non-blocking Shopify API update
 *
 * ARCHITECTURE — TWO-PATH VOTE DECRYPTION:
 * Baileys (the WhatsApp library) stores all messages in bot.store.messages (in-memory).
 * On a Railway container restart, that memory is wiped — causing "Server Restart Amnesia".
 * To survive restarts, we introduced a "Poll Vault" (whatsapp_polls SQLite table).
 *
 * Path 1 (HOT — no restart occurred):
 *   bot.store.messages has the original poll → use Baileys' getAggregateVotesInPollMessage.
 *
 * Path 2 (COLD — restart happened):
 *   bot.store misses → query whatsapp_polls by message_id → use SHA-256 hash matching.
 *   WHY SHA-256: WhatsApp encodes poll votes as SHA-256 hashes of the option strings.
 *   pollUpdate.vote.selectedOptions = [Buffer(sha256("✅ Confirm Order")), ...]
 *   We re-hash each stored option and compare buffers — no Baileys memory needed.
 *
 * BUSINESS RULE — 24-HOUR WINDOW:
 * Orders are dispatched ~24h after confirmation. Any vote (or vote change) received
 * after 24h is rejected to prevent tag changes on already-shipped orders.
 * Fail-open: if the age check itself errors, vote proceeds (never drop on infra bugs).
 *
 * ADMIN vs CUSTOMER:
 * If msg.key.fromMe is true, the vote came from the linked device (internal team).
 * In that case, the tag gets an "(Admin)" suffix → "Trace: Confirmed (Admin)".
 */
async function syncPollVoteToShopify(bot, msg, db) {
  try {
    const remoteJid = msg.key?.remoteJid;
    if (!remoteJid) return;
    const fromPhone = remoteJid.split('@')[0];

    // pollUpdateMessage = WhatsApp's event type when someone votes on a poll
    const pollUpdate = msg.message?.pollUpdateMessage;
    if (!pollUpdate) return;

    // pollCreationMessageKey.id = the message_id of the ORIGINAL poll that was sent
    // This is how WhatsApp links a vote back to its poll question
    const pollCreationKey = pollUpdate.pollCreationMessageKey;
    console.log(`🔍 [POLL_DIAG] STEP 2: pollCreationKey.id = ${pollCreationKey?.id}`);
    if (!pollCreationKey) {
      console.warn('🔍 [POLL_DIAG] ❌ BLOCKED: pollCreationKey is null/undefined');
      return;
    }

    // ── GATE 1: 24-Hour Vote Window ──
    // Business rule: orders dispatch after 24h, so we reject late votes/changes.
    // We check created_at from whatsapp_polls (set when poll was originally sent).
    // Fail-open design: if this check crashes, we proceed rather than drop the vote.
    const VOTE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    try {
      const vaultMeta = db.prepare(
        `SELECT created_at FROM whatsapp_polls WHERE message_id = ?`
      ).get(pollCreationKey.id);
      console.log(`🔍 [POLL_DIAG] STEP 3: DB vault lookup result: ${vaultMeta ? JSON.stringify(vaultMeta) : 'NOT FOUND (poll predates vault or table missing)'}`);
      if (vaultMeta && vaultMeta.created_at) {
        const pollAge = Date.now() - new Date(vaultMeta.created_at).getTime();
        const hoursOld = (pollAge / 3600000).toFixed(1);
        console.log(`🔍 [POLL_DIAG] STEP 3b: Poll age = ${hoursOld}h (limit 24h)`);
        if (pollAge > VOTE_WINDOW_MS) {
          console.warn(`⏰ [POLL_DIAG] ❌ BLOCKED by 24h window: poll is ${hoursOld}h old. Poll ID: ${pollCreationKey.id}`);
          return;
        }
      }
      // Note: if vaultMeta is null (poll predates vault), we skip the age check and proceed
    } catch (e) {
      // Fail-open: DB error during age check should never drop a legitimate vote
      console.warn('⚠️ [POLL_DIAG] Could not verify poll age, proceeding:', e.message);
    }

    // ── PATH 1: In-Memory Store (Hot Path) ──
    // Check bot.store.messages first — this is the normal case when no restart happened.
    // bot.store is populated as messages arrive and trimmed to the last 35 per JID.
    const inMemoryCount = bot.store?.messages?.[remoteJid]?.length || 0;
    console.log(`🔍 [POLL_DIAG] STEP 4: In-memory store has ${inMemoryCount} messages for JID ${remoteJid}`);
    const pollMsg = bot.store?.messages?.[remoteJid]?.find(m => m.key.id === pollCreationKey.id);
    console.log(`🔍 [POLL_DIAG] STEP 4b: In-memory poll lookup: ${pollMsg ? '✅ FOUND' : '❌ NOT FOUND (will try DB vault)'}`);

    let selectedOption = null; // will hold the winning option string (e.g. "✅ Confirm Order")

    if (pollMsg && pollMsg.message) {
      // In-memory hit — delegate decryption to the official Baileys helper
      console.log(`🗳️ [PollVault] In-memory hit for poll ${pollCreationKey.id}`);
      const { getAggregateVotesInPollMessage } = await import('@whiskeysockets/baileys');
      const votes = getAggregateVotesInPollMessage({
        message: pollMsg.message,
        pollUpdates: [
          {
            pollUpdateMessageKey: msg.key,
            vote: pollUpdate.vote,
            senderTimestampMs: pollUpdate.senderTimestampMs
          }
        ]
      });

      // getBaseJid strips device suffixes: "92300...@s.whatsapp.net:5" → "92300...@s.whatsapp.net"
      // Needed because fromMe votes carry the bot's multi-device JID which has a colon suffix
      const getBaseJid = (jid) => jid ? jid.split(':')[0].split('@')[0] + '@s.whatsapp.net' : '';
      const botJid = bot.sock?.user?.id;
      const targetBaseJid = getBaseJid(msg.key.fromMe ? botJid : remoteJid);

      // Find the option that this specific voter (customer or admin) selected
      for (const option of votes) {
        if (option.voters) {
          const hasVoted = option.voters.some(voter => getBaseJid(voter) === targetBaseJid);
          if (hasVoted) {
            selectedOption = option.name;
            break;
          }
        }
      }
    } else {
      // ── PATH 2: DB Vault Fallback (Crash-Resilience Path) ──
      // Triggered when bot.store is empty after a Railway container restart.
      // We query the whatsapp_polls table which was populated at poll-send time.
      console.warn(`⚠️ [PollVault] In-memory miss for poll ${pollCreationKey.id} — querying DB vault (restart amnesia recovery).`);

      let dbPoll = null;
      try {
        dbPoll = db.prepare(
          `SELECT poll_name, poll_options, created_at FROM whatsapp_polls WHERE message_id = ?`
        ).get(pollCreationKey.id);
      } catch (e) {
        console.error('⚠️ [PollVault] DB query failed:', e.message);
      }

      if (!dbPoll) {
        // Poll was sent before the vault feature was deployed — nothing we can do
        console.warn(`⚠️ [PollVault] Poll ${pollCreationKey.id} not found in DB vault either — vote dropped. (Was this poll sent before the vault was deployed?)`);
        return;
      }

      // ── SHA-256 Hash Matching ──
      // WhatsApp does NOT send the raw option string in pollUpdate.vote.
      // Instead it sends SHA-256 hashes of whichever options were selected.
      // pollUpdate.vote.selectedOptions = [Buffer(sha256("✅ Confirm Order")), ...]
      //
      // To decode: hash each stored option string and compare buffers.
      // This is cryptographically reliable — same option always produces the same hash.
      // No Baileys internal state or message object needed.
      const crypto = require('crypto');
      let pollOptions = [];
      try {
        // poll_options is stored as a JSON array: ["✅ Confirm Order", "❌ Cancel", "✏️ Edit"]
        pollOptions = JSON.parse(dbPoll.poll_options);
      } catch (_) {
        console.error('⚠️ [PollVault] Failed to parse stored poll_options JSON');
        return;
      }

      const selectedOptions = pollUpdate.vote?.selectedOptions || [];
      if (!selectedOptions.length) {
        // Empty selectedOptions means the voter tapped their own vote to deselect it — ignore
        console.log(`🗳️ [PollVault] Empty selectedOptions — voter cleared their selection.`);
        return;
      }

      for (const optionStr of pollOptions) {
        // Hash the stored option string exactly as WhatsApp would
        const hash = crypto.createHash('sha256').update(optionStr).digest();
        const matched = selectedOptions.some(sel => {
          // selectedOptions items may arrive as Buffer or Uint8Array depending on Baileys version
          const selBuf = Buffer.isBuffer(sel) ? sel : Buffer.from(sel);
          return Buffer.compare(selBuf, hash) === 0; // byte-perfect comparison
        });
        if (matched) {
          selectedOption = optionStr;
          console.log(`✅ [PollVault] SHA-256 matched option: "${selectedOption}" from DB vault (poll: "${dbPoll.poll_name}")`);
          break;
        }
      }

      if (!selectedOption) {
        // Should rarely happen — would mean WhatsApp changed how it hashes options
        console.warn(`⚠️ [PollVault] SHA-256 hash did not match any stored option for poll ${pollCreationKey.id}. Vote hash may be salted or option set changed.`);
        return;
      }
    }

    console.log(`🔍 [POLL_DIAG] STEP 5: selectedOption resolved = "${selectedOption || 'NULL — no match found'}"`); 

    if (selectedOption) {
      const lowerVote = selectedOption.toLowerCase();
      const isConfirm = lowerVote.includes('confirm') || selectedOption.includes('✅');
      const isEdit = lowerVote.includes('edit') || lowerVote.includes('size') || lowerVote.includes('address') || selectedOption.includes('✏️');
      const isCancel = lowerVote.includes('cancel') || selectedOption.includes('❌');
      console.log(`🔍 [POLL_DIAG] STEP 5b: isConfirm=${isConfirm}, isCancel=${isCancel}, isEdit=${isEdit}`);

      let statusTag = null;
      if (isConfirm) {
        statusTag = 'Trace: Confirmed';
      } else if (isCancel) {
        statusTag = 'Trace: Cancelled';
      } else if (isEdit) {
        statusTag = 'Trace: Edit Required';
      }

      console.log(`🔍 [POLL_DIAG] STEP 6: statusTag = "${statusTag || 'NULL — vote option did not match confirm/cancel/edit keywords'}"`); 

      if (statusTag) {
        const finalTag = msg.key.fromMe ? `${statusTag} (Admin)` : statusTag;
        const cleanPhone = fromPhone.replace(/\D/g, '');
        const searchPattern = `%${cleanPhone.substring(Math.max(0, cleanPhone.length - 10))}%`;
        console.log(`🔍 [POLL_DIAG] STEP 7: Looking up order for phone="${cleanPhone}", pattern="${searchPattern}", fromMe=${msg.key.fromMe}, finalTag="${finalTag}"`);

        const order = db.prepare(`
          SELECT id, shopify_order_id, phone FROM orders
          WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
          ORDER BY id DESC LIMIT 1
        `).get(searchPattern);

        console.log(`🔍 [POLL_DIAG] STEP 7b: Order lookup result: ${order ? JSON.stringify(order) : 'NOT FOUND'}`);

        if (order && order.id) {
          console.log(`🗳️ [POLL_DIAG] STEP 8: ✅ Firing Shopify tag update for order ${order.id} → tag "${finalTag}"`);
          updateShopifyOrderTagsNonBlocking(bot.tenantId || 'default', order.id, finalTag, db);
        } else {
          console.warn(`⚠️ [POLL_DIAG] ❌ BLOCKED: No order found for phone: ${cleanPhone} (last 10 digits pattern: ${searchPattern})`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error in syncPollVoteToShopify:', err.message);
  }
}

/**
 * Updates Shopify order tags asynchronously (non-blocking, fire-and-forget)
 */
function updateShopifyOrderTagsNonBlocking(tenantId, erpOrderId, newTag, db) {
  setImmediate(async () => {
    const tenantContext = require('../tenant-context');
    tenantContext.run(tenantId, async () => {
      try {
        console.log(`🏷️ [ShopifyTagSync] Starting tag update for ERP order ID: ${erpOrderId}, new tag: "${newTag}"`);
        const fetch = require('node-fetch');

        const orderInfo = db.prepare(`
          SELECT o.shopify_order_id, s.shop_domain, s.access_token, s.id as store_id
          FROM orders o
          JOIN stores s ON o.store_id = s.id
          WHERE o.id = ?
        `).get(erpOrderId);

        console.log(`🔍 [POLL_DIAG] STEP 9: orderInfo for ERP order ${erpOrderId} = ${orderInfo ? `shopify_order_id=${orderInfo.shopify_order_id}, shop_domain=${orderInfo.shop_domain}, token_set=${!!orderInfo.access_token}` : 'NOT FOUND — order/store join failed'}`);
        if (!orderInfo) {
          console.error(`⚠️ [POLL_DIAG] ❌ STEP 9 FAIL: No orderInfo for ERP order ID: ${erpOrderId}`);
          return;
        }

        const { shopify_order_id: shopifyOrderId, shop_domain: shopDomain, access_token: accessToken } = orderInfo;
        if (!accessToken || accessToken === 'PENDING') {
          console.error(`⚠️ [POLL_DIAG] ❌ STEP 9 FAIL: Invalid/missing access token for store (order ${erpOrderId})`);
          return;
        }

        // 1. Fetch current tags
        const getUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
        const getRes = await fetch(getUrl, {
          headers: {
            'X-Shopify-Access-Token': accessToken
          },
          timeout: 15000
        });

        if (!getRes.ok) {
          throw new Error(`Failed to GET order: ${getRes.status} ${getRes.statusText}`);
        }

        const getData = await getRes.json();
        const existingTagsStr = getData.order?.tags || '';
        const existingTags = existingTagsStr ? existingTagsStr.split(',').map(t => t.trim()) : [];

        // 2. Clean trace tags and add the new one
        const cleanedTags = existingTags.filter(t => !t.startsWith('Trace:'));
        cleanedTags.push(newTag);
        const updatedTagsStr = cleanedTags.join(', ');

        // 3. Push the new tags back to Shopify
        const putUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
        const putRes = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            order: {
              id: shopifyOrderId,
              tags: updatedTagsStr
            }
          }),
          timeout: 15000
        });

        if (!putRes.ok) {
          throw new Error(`Failed to PUT order tags: ${putRes.status} ${putRes.statusText}`);
        }

        console.log(`✅ [ShopifyTagSync] Successfully updated tags on Shopify for order ${shopifyOrderId} to: "${updatedTagsStr}"`);
      } catch (err) {
        console.error(`❌ [ShopifyTagSync] Error updating Shopify order tags for ERP order ID ${erpOrderId}:`, err.message);
      }
    });
  });
}

module.exports = {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  saveMediaFile,
  processQueue,
  processIncomingMessage,
  adaptiveStrategy,
  syncPollVoteToShopify
};
