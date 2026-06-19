const path = require('path');
const fs = require('fs');
const { db } = require('../../db');
const tenantContext = require('../../tenant-context');
const {
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  saveMediaFile,
  processIncomingMessage
} = require('../whatsapp_message_processor');

/**
 * Handles incoming presence updates from WhatsApp (e.g., typing/recording states)
 * and broadcasts them via global WebSockets.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {object} update - The presence update object
 * @param {string} update.id - The contact JID
 * @param {object} update.presences - The map of presence states per device
 * @returns {void}
 */
function handlePresenceUpdate(bot, update) {
  const { id, presences } = update;
  if (!presences) return;
  for (const key of Object.keys(presences)) {
    const presence = presences[key];
    const cleanJid = key.split('@')[0];
    let phone = cleanJid;
    if (key.endsWith('@lid')) {
      try {
        const row = db.prepare('SELECT phone FROM wa_lid_mappings WHERE lid = ?').get(cleanJid);
        if (row) phone = row.phone;
      } catch (e) {}
    }
    const isTyping = presence.lastKnownPresence === 'composing' || presence.lastKnownPresence === 'recording';
    
    try {
      const { broadcast } = require('../../websocket');
      broadcast('typing', { phone, isTyping });
    } catch (e) {}
  }
}

/**
 * Processes initial history sync event payload from Baileys, inserting
 * historical messages into the SQLite DB.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {object} payload - The history sync payload
 * @param {Array<object>} payload.chats - Synchronized chats array
 * @param {Array<object>} payload.messages - Synchronized historical messages array
 * @param {boolean} payload.isLatest - Flag if this is the latest sync chunk
 * @returns {Promise<void>}
 */
async function handleMessagingHistorySet(bot, { chats, messages, isLatest }) {
  console.log(`📦 WhatsApp History Sync received: ${chats?.length || 0} chats, ${messages?.length || 0} messages`);
  if (messages) {
    const cutoffTimestamp = (Date.now() / 1000) - (14 * 24 * 60 * 60); // 14 days ago
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      try {
        if (i % 500 === 0) await new Promise(r => setTimeout(r, 10));

        if (!msg.message) continue;
        const msgTimestamp = Number(msg.messageTimestamp);
        if (msgTimestamp && msgTimestamp < cutoffTimestamp) continue;

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter')) continue;
        
        if (!bot.store.messages[remoteJid]) bot.store.messages[remoteJid] = [];
        bot.store.messages[remoteJid].push(msg);

        const fromPhone = getPhoneFromJid(msg, db);
        const text = getMessageText(msg);
        const mediaDetails = getMessageMediaDetails(msg);
        if (!text && !mediaDetails) continue;

        const isOutgoing = msg.key.fromMe;
        let mediaType = mediaDetails ? mediaDetails.type : null;
        const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');

        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
        if (bot.ephemeralMode !== 1 && order) {
          db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status)
            VALUES (?, ?, ?, ?, ?, ?, null, ?, 'sent')
            ON CONFLICT(message_id) DO NOTHING
          `).run(order.store_id, order.id, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaType);
        }
      } catch (err) {
        // Ignore individual errors
      }
    }
    console.log(`✅ WhatsApp History Sync processed successfully.`);
  }
}

/**
 * Resolves a selected poll option string from its raw SHA-256 hashes.
 * 
 * @param {Array<string|Buffer>} selectedOptions - Selection hashes or string labels
 * @param {Array<string>} pollOptions - Possible choices string array
 * @returns {string|null} Resolved option name or null
 */
function resolveSelectedOptionFromHashes(selectedOptions, pollOptions) {
  if (!selectedOptions || !selectedOptions.length) {
    return null;
  }
  
  const crypto = require('crypto');

  for (const sel of selectedOptions) {
    if (typeof sel === 'string') {
      return sel;
    }
    const selBuf = Buffer.isBuffer(sel) ? sel : Buffer.from(sel);
    if (pollOptions && pollOptions.length) {
      for (const optionStr of pollOptions) {
        const hash = crypto.createHash('sha256').update(optionStr).digest();
        if (Buffer.compare(selBuf, hash) === 0) {
          return optionStr;
        }
      }
    }
  }
  
  return null;
}

/**
 * Safely extracts the messageSecret from a Baileys message object in RAM.
 * Handles nested structure, poll message types, and common wrappers (ephemeral, viewOnce, etc.).
 */
/**
 * Handles message status changes, poll votes, and message reaction events.
 * Updates message status columns (e.g., delivered/sent) in the DB.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {Array<object>} updates - Array of message update objects
 * @returns {Promise<void>}
 */
async function handleMessagesUpdate(bot, updates) {
  // LOG EVERYTHING unconditionally to find the real structure
  console.log(`\n🚨 [RAW_PAYLOAD_DUMP] Inspecting incoming update/message object:`);
  console.log(JSON.stringify(updates, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2
  ));

  for (const { key, update } of updates) {
    const messageId = key.id;
    const statusVal = update.status;
    
    if (messageId && statusVal >= 2) {
      let statusStr = 'delivered';
      if (statusVal === 2) statusStr = 'sent';
      else if (statusVal === 3) statusStr = 'delivered';
      else if (statusVal >= 4) statusStr = 'read';

      if (bot.ephemeralMode !== 1) {
        try {
          db.prepare("UPDATE whatsapp_messages SET status = ? WHERE message_id = ?").run(statusStr, messageId);
        } catch (e) {}
      }

      try {
        const { broadcast } = require('../../websocket');
        broadcast('messages.update', { id: messageId, status: statusStr });
      } catch (e) {}
      
      const pendingAckDir = path.resolve(__dirname, '..', '..', 'pending_ack');
      if (fs.existsSync(pendingAckDir)) {
        try {
          const files = fs.readdirSync(pendingAckDir);
          for (const file of files) {
            if (file.startsWith(messageId)) {
              const filePath = path.join(pendingAckDir, file);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ [PENDING_ACK] Unlinked file upon delivery confirmation: ${filePath}`);
              }
            }
          }
        } catch (err) {
          console.error(`⚠️ Failed to cleanup pending_ack file for message ${messageId}:`, err.message);
        }
      }
    }

    // Temporarily relaxed check to analyze update payloads
    if (key.remoteJid && !key.remoteJid.includes('@g.us')) {
      try {
        const pollId = key.id;
        console.log(`\n🔍 [X-RAY] Poll ID from WA: ${pollId}`);
        console.log(`🔍 [X-RAY] Raw pollUpdates payload:`, JSON.stringify(update.pollUpdates, null, 2));

        if (!pollId) return;

        // ── Print chosen option unconditionally ──
        if (update.pollUpdates && Array.isArray(update.pollUpdates)) {
          for (const option of update.pollUpdates) {
            if (option.voters && option.voters.length > 0) {
              console.log(`\n==================================================`);
              console.log(`🚨 [POLL_VOTE_CHOSEN] SUCCESS! A vote has been registered.`);
              console.log(`📱 Poll ID: ${key?.id || update.key?.id}`);
              console.log(`🎯 Exact Option String: "${option.name}"`);
              console.log(`👤 Voter JID: ${option.voters[0]}`);
              console.log(`==================================================\n`);
            }
          }
        }

        // 1. Fetch DB Record to retrieve order_id and tenant_id
        let dbRecord = null;
        let trueRemoteJid = key.remoteJid;
        try {
          const pollRow = db.prepare(
            `SELECT remote_jid, tenant_id FROM whatsapp_polls WHERE message_id = ?`
          ).get(pollId);
          
          if (pollRow) {
            trueRemoteJid = pollRow.remote_jid;
            const cleanPhone = pollRow.remote_jid.split('@')[0].replace(/\D/g, '');
            const searchPattern = `%${cleanPhone.substring(Math.max(0, cleanPhone.length - 10))}%`;
            const orderRow = db.prepare(`
              SELECT id as order_id FROM orders
              WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
              ORDER BY id DESC LIMIT 1
            `).get(searchPattern);
            
            if (orderRow) {
              dbRecord = {
                order_id: orderRow.order_id,
                tenant_id: pollRow.tenant_id
              };
            }
          }
        } catch (e) {
          console.error('⚠️ [PollNative] Failed to fetch dbRecord in handleMessagesUpdate:', e.message);
        }

        console.log(`🔍 [X-RAY] DB Record Found: ${!!dbRecord}`);
        
        if (!dbRecord) {
          console.log(`⚠️ [X-RAY] Skipping - Poll ID ${pollId} not found in our SQLite DB.`);
          return;
        }

        const fromPhone = trueRemoteJid.split('@')[0];
        let selectedOption = null;

        // 2. Parse Baileys Native Format (Option Name + Array of Voters)
        if (update.pollUpdates && Array.isArray(update.pollUpdates)) {
          for (const option of update.pollUpdates) {
          // If someone voted for this option, voters array will have elements
          if (option.voters && option.voters.length > 0) {
            selectedOption = option.name;
            const optStr = String(option.name).toLowerCase();
            let tagToApply = '';
            
            if (optStr.includes('confirm')) tagToApply = 'Trace: Confirmed';
            else if (optStr.includes('cancel')) tagToApply = 'Trace: Cancelled';
            else if (optStr.includes('edit') || optStr.includes('size') || optStr.includes('address')) tagToApply = 'Trace: Edit Requested';

            if (tagToApply && dbRecord) {
              // Polyfill db.run if it doesn't exist (Node DatabaseSync has prepare/run but not db.run)
              if (typeof db.run !== 'function') {
                db.run = function(sql, params, callback) {
                  try {
                    const stmt = this.prepare(sql);
                    stmt.run(...params);
                    if (typeof callback === 'function') callback(null);
                  } catch (err) {
                    if (typeof callback === 'function') callback(err);
                  }
                };
              }

              // Ensure order_id is saved to whatsapp_polls so the erp_status update matches
              try {
                db.prepare(`UPDATE whatsapp_polls SET order_id = ? WHERE message_id = ?`).run(dbRecord.order_id, pollId);
              } catch (e) {}

              // ── 1. Update whatsapp_polls local erp_status ──────────────────
              const query = `UPDATE whatsapp_polls SET erp_status = ?, shopify_synced = 0 WHERE order_id = ?`;
              db.run(query, [tagToApply, dbRecord.order_id], function(err) {
                  if (err) {
                      console.error(`[ERP_DB] ❌ Failed to update local status:`, err);
                  } else {
                      console.log(`[ERP_DB] ✅ Local ERP status safely updated to "${tagToApply}" for Order ${dbRecord.order_id}`);
                  }
              });

              // ── 2. Sync to main orders table (delivery_status + payment_status) ──
              // Maps the WA poll tag to the canonical ERP status values used by the
              // Command Centre dropdown so the order updates live on the dashboard.
              try {
                let mainDeliveryStatus = null;
                let mainPaymentStatus = null;

                if (tagToApply.includes('Confirmed')) {
                  mainDeliveryStatus = 'Confirmed';
                  mainPaymentStatus  = 'COD Confirmed';
                } else if (tagToApply.includes('Cancelled')) {
                  mainDeliveryStatus = 'Cancelled';
                  mainPaymentStatus  = 'COD Cancelled';
                } else if (tagToApply.includes('Edit')) {
                  // Hold the order for customer edit — do not change delivery_status,
                  // only flag payment_status so fulfilment team sees it
                  mainPaymentStatus  = 'On Hold - Customer Edit';
                }

                if (mainDeliveryStatus || mainPaymentStatus) {
                  // Build a targeted UPDATE so we only touch the columns we know about
                  const setClauses = [];
                  const setParams  = [];

                  if (mainDeliveryStatus) {
                    setClauses.push(`delivery_status = ?`);
                    setParams.push(mainDeliveryStatus);
                  }
                  if (mainPaymentStatus) {
                    setClauses.push(`payment_status = ?`);
                    setParams.push(mainPaymentStatus);
                  }
                  // Always stamp status_date and wa_verification_status for audit trail
                  setClauses.push(`status_date = datetime('now', '+5 hours')`);
                  if (tagToApply.includes('Confirmed')) {
                    setClauses.push(`wa_verification_status = 'verified'`);
                  }

                  setParams.push(dbRecord.order_id);

                  db.prepare(
                    `UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`
                  ).run(...setParams);

                  console.log(`[ERP_DB] 🔄 Main Order ${dbRecord.order_id} auto-synced: delivery_status="${mainDeliveryStatus || '(unchanged)'}", payment_status="${mainPaymentStatus || '(unchanged)'}"`);

                  // ── 3. Fire SSE broadcast so Command Centre updates immediately ──
                  try {
                    const orderRow = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(dbRecord.order_id);
                    if (orderRow) {
                      const { broadcast } = require('../../sse');
                      broadcast('order_updated', {
                        storeId: orderRow.store_id,
                        shopifyOrderId: orderRow.shopify_order_id,
                        orderId: dbRecord.order_id,
                        delivery_status: mainDeliveryStatus,
                        payment_status: mainPaymentStatus,
                        source: 'wa_poll'
                      });
                      console.log(`[ERP_DB] 📡 SSE broadcast fired for Order ${dbRecord.order_id}`);
                    }
                  } catch (sseErr) {
                    console.warn(`[ERP_DB] ⚠️ SSE broadcast failed (non-fatal):`, sseErr.message);
                  }
                }
              } catch (syncErr) {
                // Non-fatal: whatsapp_polls is still updated even if main orders sync fails
                console.error(`[ERP_DB] ❌ Failed to sync WA vote to main orders table:`, syncErr.message);
              }
            }
          }
        }
        
        if (selectedOption) {
            console.log(`🗳️ [POLL_VOTE] Customer +${fromPhone} voted: "${selectedOption}" in poll: ${key.id}`);
            const cleanPhone = fromPhone.replace(/\D/g, '');
            
            const pendingCOD = db.prepare(
              `SELECT * FROM cod_pending_verifications WHERE phone = ? AND status = 'pending'
               AND expires_at > datetime('now', '+5 hours') ORDER BY id DESC LIMIT 1`
            ).get(cleanPhone);
            
            if (pendingCOD) {
              const lowerVote = selectedOption.toLowerCase();
              const isConfirm = lowerVote.includes('confirm');
              const isEdit = lowerVote.includes('edit') || lowerVote.includes('size') || lowerVote.includes('address');
              const isCancel = lowerVote.includes('cancel');

              // Fetch the order ref for use in auto-reply messages
              let orderRef = `#${pendingCOD.order_id}`;
              try {
                const orderRow = db.prepare('SELECT ref_number FROM orders WHERE id = ?').get(pendingCOD.order_id);
                if (orderRow && orderRow.ref_number) orderRef = orderRow.ref_number;
              } catch (_) {}

              // Log incoming poll vote to messages table
              if (bot.ephemeralMode !== 1) {
                try {
                  const order = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                  const storeId = order ? order.store_id : 1;
                  db.prepare(`
                    INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
                    VALUES (?, ?, ?, 'incoming', ?)
                  `).run(storeId, pendingCOD.order_id, cleanPhone, `🗳️ Selected: ${selectedOption}`);
                  
                  const { broadcast: wsBroadcast } = require('../../websocket');
                  wsBroadcast('message', {
                    order_id: pendingCOD.order_id,
                    message: {
                      store_id: storeId,
                      order_id: pendingCOD.order_id,
                      phone: cleanPhone,
                      direction: 'incoming',
                      message: `🗳️ Selected: ${selectedOption}`,
                      created_at: new Date().toISOString()
                    }
                  });
                } catch (e) {}
              }

              if (isConfirm) {
                // ✅ CONFIRM ORDER
                db.prepare(`UPDATE cod_pending_verifications SET status = 'confirmed', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
                db.prepare(`UPDATE orders SET wa_verification_status = 'verified', payment_status = 'COD Confirmed', delivery_status = 'confirmed' WHERE id = ?`).run(pendingCOD.order_id);
                const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                if (order) {
                  const { broadcast } = require('../../sse');
                  broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                }
                await sendAutoResponderReply(bot, fromPhone, 'Trace: Confirmed', pendingCOD, orderRef);
                console.log(`🗳️ [POLL] COD Confirmed: Order ${pendingCOD.order_id} by customer +${fromPhone}`);

              } else if (isEdit) {
                // ✏️ EDIT SIZE / ADDRESS — put order on hold
                db.prepare(`UPDATE cod_pending_verifications SET status = 'on_hold', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
                db.prepare(`UPDATE orders SET payment_status = 'On Hold - Customer Edit' WHERE id = ?`).run(pendingCOD.order_id);
                const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                if (order) {
                  const { broadcast } = require('../../sse');
                  broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                }
                await sendAutoResponderReply(bot, fromPhone, 'Trace: Edit Requested', pendingCOD, orderRef);
                console.log(`🗳️ [POLL] COD On Hold (Edit): Order ${pendingCOD.order_id} by customer +${fromPhone}`);

              } else if (isCancel) {
                // ❌ CANCEL ORDER
                db.prepare(`UPDATE cod_pending_verifications SET status = 'cancelled', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
                db.prepare(`UPDATE orders SET payment_status = 'COD Cancelled' WHERE id = ?`).run(pendingCOD.order_id);
                const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                if (order) {
                  const { broadcast } = require('../../sse');
                  broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                }
                await sendAutoResponderReply(bot, fromPhone, 'Trace: Cancelled', pendingCOD, orderRef);
                console.log(`🗳️ [POLL] COD Cancelled: Order ${pendingCOD.order_id} by customer +${fromPhone}`);
              }
            }
          }
        }
      } catch (pollErr) {
        console.error('⚠️ Poll vote handling failed:', pollErr.message);
      }
    }
  }
}const downloadMediaAndUpload = async (message) => {
  const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
  const cloudinary = require('../../cloudinaryConfig');
  const buffer = await downloadMediaMessage(message, 'buffer', {});
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'trace_erp_whatsapp' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
};


/**
 * Main incoming/outgoing message handler. Validates type, processes media downloads,
 * checks trigger intents, matches auto-responders, and runs the AI response loop.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {object} m - Message upsert payload from Baileys socket
 * @param {Array<object>} m.messages - Array of received message structures
 * @param {string} m.type - Event notify type ('notify' or 'append')
 * @returns {Promise<void>}
 */
async function handleMessagesUpsert(bot, m) {
  const { messages, type } = m;
  if (type !== 'notify' && type !== 'append') return;
  for (const msg of messages) {
    const isFromCustomer = !msg.key.fromMe && msg.key.remoteJid && !msg.key.remoteJid.includes('@g.us');
    const msgText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    // Direct Cloudinary Ingestion for incoming media messages
    if (isFromCustomer && bot.ephemeralMode !== 1) {
      const mediaDetails = getMessageMediaDetails(msg);
      if (mediaDetails && (mediaDetails.type === 'image' || mediaDetails.type === 'audio' || mediaDetails.type === 'video')) {
        setImmediate(() => {
          tenantContext.run(bot.tenantId, async () => {
            try {
              console.log(`📸 [Cloudinary EventRouter] Uploading incoming media (${mediaDetails.type}) to Cloudinary...`);
              const secure_url = await downloadMediaAndUpload(msg);
              console.log(`✅ [Cloudinary EventRouter] secure_url = ${secure_url}`);

              const cleanPhone = msg.key.remoteJid.split('@')[0].replace(/\D/g, '');
              const order = db.prepare(`SELECT id, store_id FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${cleanPhone.substring(Math.max(0, cleanPhone.length - 10))}%`);
              const orderId = order ? order.id : null;
              const storeId = order ? order.store_id : 1;
              const finalMessage = `[${mediaDetails.type.toUpperCase()}]`;

              let dbMessageId = null;
              const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE message_id = ?').get(msg.key.id);
              if (!existing) {
                const result = db.prepare(`
                  INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
                  VALUES (?, ?, ?, 'incoming', ?, ?, ?, ?, 'sent', ?)
                `).run(storeId, orderId, cleanPhone, finalMessage, msg.key.id, secure_url, mediaDetails.type, bot.tenantId || 'default');
                dbMessageId = result.lastInsertRowid;
              } else {
                db.prepare('UPDATE whatsapp_messages SET media_url = ?, media_type = ? WHERE message_id = ?').run(secure_url, mediaDetails.type, msg.key.id);
                dbMessageId = existing.id;
              }

              try {
                const { broadcast } = require('../../websocket');
                broadcast('message', {
                  order_id: orderId,
                  message: {
                    id: dbMessageId,
                    store_id: storeId,
                    order_id: orderId,
                    phone: cleanPhone,
                    direction: 'incoming',
                    message: finalMessage,
                    message_id: msg.key.id,
                    media_url: secure_url,
                    media_type: mediaDetails.type,
                    status: 'sent',
                    created_at: new Date().toISOString()
                  }
                });
              } catch (wsErr) {
                console.error('⚠️ [Cloudinary EventRouter] WebSocket broadcast failed:', wsErr.message);
              }
            } catch (err) {
              console.error('❌ [Cloudinary EventRouter] Stream upload failed:', err.message);
            }
          });
        });
      }
    }

    if (isFromCustomer && msgText) {
      const cleanPhone = msg.key.remoteJid.split('@')[0].replace(/\D/g, '');
      try {
        const pendingCOD = db.prepare(
          `SELECT * FROM cod_pending_verifications WHERE phone = ? AND status = 'pending'
           AND expires_at > datetime('now', '+5 hours') ORDER BY id DESC LIMIT 1`
        ).get(cleanPhone);

        if (pendingCOD) {
          // Normalize the text: lowercase, remove punctuation, remove extra spaces
          const normalizedText = msgText.toLowerCase().replace(/[.,!?'"]/g, '').trim();
          
          // Robust Keyword Dictionaries (English + Roman Urdu)
          const confirmWords = ['1', 'confirm', 'ok', 'yes', 'han', 'kardo', 'bhej do', 'done', 'cnf', 'right', 'bhejdain', 'jee', 'ji'];
          const cancelWords = ['2', 'cancel', 'no', 'nahi', 'cancel kardo', 'not order', 'cancel it', 'cancel order', 'cancl', 'cncl', 'cancel krdo'];
          const editWords = ['3', 'edit', 'change', 'size', 'address', 'galat', 'ghalat', 'mistake', 'update'];

          let tagToApply = '';

          // Helper function to check if any keyword exists in the normalized text
          const matches = (keywordsArray) => keywordsArray.some(keyword => normalizedText.includes(keyword) || normalizedText === keyword);

          if (matches(confirmWords)) {
              tagToApply = 'Trace: Confirmed';
          } else if (matches(cancelWords)) {
              tagToApply = 'Trace: Cancelled';
          } else if (matches(editWords)) {
              tagToApply = 'Trace: Edit Requested';
          } else {
              // FALLBACK: Customer wrote something complex (e.g. "kal delivery de dena")
              tagToApply = 'Trace: Manual Review'; 
          }

          const dbRecord = {
            order_id: pendingCOD.order_id,
            tenant_id: bot.tenantId || 'default'
          };
          
          let pollId = null;
          try {
            const pollRow = db.prepare(
              `SELECT message_id FROM whatsapp_polls WHERE remote_jid = ? ORDER BY id DESC LIMIT 1`
            ).get(msg.key.remoteJid);
            if (pollRow) pollId = pollRow.message_id;
          } catch (_) {}

          // Polyfill db.run if it doesn't exist
          if (typeof db.run !== 'function') {
            db.run = function(sql, params, callback) {
              try {
                const stmt = this.prepare(sql);
                stmt.run(...params);
                if (typeof callback === 'function') callback(null);
              } catch (err) {
                if (typeof callback === 'function') callback(err);
              }
            };
          }

          if (pollId) {
            try {
              db.prepare(`UPDATE whatsapp_polls SET order_id = ? WHERE message_id = ?`).run(dbRecord.order_id, pollId);
            } catch (e) {}
          }

          // Fetch the order ref for use in auto-reply messages
          let orderRef = `#${pendingCOD.order_id}`;
          try {
            const orderRow = db.prepare('SELECT ref_number FROM orders WHERE id = ?').get(pendingCOD.order_id);
            if (orderRow && orderRow.ref_number) orderRef = orderRow.ref_number;
          } catch (_) {}

          console.log(`🎯 [TEXT_REPLY_MATCH] Customer +${cleanPhone} matched: "${tagToApply}" for Order ${pendingCOD.order_id} (input: "${msgText}")`);

          // ── 1. Update whatsapp_polls local erp_status ──────────────────
          const query = `UPDATE whatsapp_polls SET erp_status = ?, shopify_synced = 0 WHERE order_id = ?`;
          db.run(query, [tagToApply, dbRecord.order_id], function(err) {
              if (err) {
                  console.error(`[ERP_DB] ❌ Failed to update local status:`, err);
              } else {
                  console.log(`[ERP_DB] ✅ Local ERP status safely updated to "${tagToApply}" for Order ${dbRecord.order_id} via text reply`);
              }
          });

          // ── 2. Sync to main orders table (delivery_status + payment_status) ──
          try {
            let mainDeliveryStatus = null;
            let mainPaymentStatus = null;

            if (tagToApply.includes('Confirmed')) {
              mainDeliveryStatus = 'Confirmed';
              mainPaymentStatus  = 'COD Confirmed';
            } else if (tagToApply.includes('Cancelled')) {
              mainDeliveryStatus = 'Cancelled';
              mainPaymentStatus  = 'COD Cancelled';
            } else if (tagToApply.includes('Edit')) {
              mainPaymentStatus  = 'On Hold - Customer Edit';
            } else if (tagToApply.includes('Manual')) {
              mainPaymentStatus  = 'On Hold - Customer Edit';
            }

            if (mainDeliveryStatus || mainPaymentStatus) {
              const setClauses = [];
              const setParams  = [];

              if (mainDeliveryStatus) {
                setClauses.push(`delivery_status = ?`);
                setParams.push(mainDeliveryStatus);
              }
              if (mainPaymentStatus) {
                setClauses.push(`payment_status = ?`);
                setParams.push(mainPaymentStatus);
              }
              setClauses.push(`status_date = datetime('now', '+5 hours')`);
              if (tagToApply.includes('Confirmed')) {
                setClauses.push(`wa_verification_status = 'verified'`);
              }

              setParams.push(dbRecord.order_id);

              db.prepare(
                `UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`
              ).run(...setParams);

              console.log(`[ERP_DB] 🔄 Main Order ${dbRecord.order_id} auto-synced via text: delivery_status="${mainDeliveryStatus || '(unchanged)'}", payment_status="${mainPaymentStatus || '(unchanged)'}"`);

              // ── 3. Fire SSE broadcast so Command Centre updates immediately ──
              try {
                const orderRow = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(dbRecord.order_id);
                if (orderRow) {
                  const { broadcast } = require('../../sse');
                  broadcast('order_updated', {
                    storeId: orderRow.store_id,
                    shopifyOrderId: orderRow.shopify_order_id,
                    orderId: dbRecord.order_id,
                    delivery_status: mainDeliveryStatus,
                    payment_status: mainPaymentStatus,
                    source: 'wa_text_reply'
                  });
                  console.log(`[ERP_DB] 📡 SSE broadcast fired for Order ${dbRecord.order_id}`);
                }
              } catch (sseErr) {
                console.warn(`[ERP_DB] ⚠️ SSE broadcast failed (non-fatal):`, sseErr.message);
              }
            }
          } catch (syncErr) {
            console.error(`[ERP_DB] ❌ Failed to sync WA vote to main orders table:`, syncErr.message);
          }

          // ── 4. Update cod_pending_verifications and send messages ──
          if (tagToApply === 'Trace: Confirmed') {
            db.prepare(`UPDATE cod_pending_verifications SET status = 'confirmed', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
          } else if (tagToApply === 'Trace: Cancelled') {
            db.prepare(`UPDATE cod_pending_verifications SET status = 'cancelled', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
          } else if (tagToApply === 'Trace: Edit Requested') {
            db.prepare(`UPDATE cod_pending_verifications SET status = 'on_hold', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
          }
          
          await sendAutoResponderReply(bot, msg.key.remoteJid, tagToApply, pendingCOD, orderRef);
        }
      } catch (e) {
        console.error('[ERP_DB] Failed to process fuzzy text reply update:', e.message);
      }
    }

    // ── CRITICAL: Poll votes MUST bypass the portal-hook HTTP path ──
    // pollUpdate.vote.selectedOptions contains raw Uint8Array/Buffer SHA-256 hashes.
    // JSON.stringify → JSON.parse (used by portal-hook) corrupts binary data:
    //   Uint8Array([23, 45, ...]) → {"0":23,"1":45,...} (plain object, not a Buffer)
    // This breaks BOTH Baileys' getAggregateVotesInPollMessage AND our SHA-256 matching.
    // Solution: process poll votes directly, skipping serialization entirely.
    if (msg.message?.pollUpdateMessage) {
      console.log(`🗳️ [PollVault] Poll vote detected — bypassing portal-hook to preserve Buffer integrity. JID: ${msg.key?.remoteJid}`);
      setImmediate(() => {
        tenantContext.run(bot.tenantId, async () => {
          try {
            await processIncomingMessage(bot, msg, bot.sock, db);
          } catch (e) {
            console.error('[PollVault] Direct poll processing error:', e.message);
          }
        });
      });
      continue; // skip portal-hook routing for this message
    }

    setImmediate(() => {
      tenantContext.run(bot.tenantId, async () => {
        try {
          const port = process.env.PORT || 3001;
          const url = `http://localhost:${port}/api/webhooks/whatsapp/portal-hook?tenant_id=${encodeURIComponent(bot.tenantId)}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Id': bot.tenantId,
              'auth': 'tracepk'
            },
            body: JSON.stringify({ msg })
          });
          if (!response.ok) {
            const errText = await response.text();
            console.error(`[Portal Hook Router] API call failed: status=${response.status}, body=${errText}`);
            try {
              await processIncomingMessage(bot, msg, bot.sock, db);
            } catch (localErr) {
              console.error('[Local Process Error]', localErr.message);
            }
          }
        } catch (err) {
          console.error(`[Portal Hook Router] Failed to route via API, falling back to local:`, err.message);
          try {
            await processIncomingMessage(bot, msg, bot.sock, db);
          } catch (localErr) {
            console.error('[Local Process Error]', localErr.message);
          }
        }
      });
    });
  }
}

/**
 * Retrieves list of processed WhatsApp messages from Bot stores in memory.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {string} phone - Target phone number
 * @returns {Array<object>} Array of mapped historical message items
 */
function getChatHistory(bot, phone) {
  if (!bot.store || !bot.store.messages) return [];
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
  else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
  const jid = cleaned + '@s.whatsapp.net';
  
  const msgs = bot.store.messages[jid] || [];
  return msgs.map(m => {
    const text = getMessageText(m);
    const mediaDetails = getMessageMediaDetails(m);
    if (!text && !mediaDetails) return null;
    let mediaType = mediaDetails ? mediaDetails.type : null;
    const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');

    return {
      id: m.key.id,
      phone: cleaned,
      direction: m.key.fromMe ? 'outgoing' : 'incoming',
      message: finalMessage,
      media_type: mediaType,
      status: m.key.fromMe ? (m.status === 3 ? 'delivered' : 'sent') : 'received',
      created_at: new Date((Number(m.messageTimestamp) || Date.now()/1000) * 1000).toISOString()
    };
  }).filter(Boolean);
}

/**
 * Orchestrates fetching historical message logs for a specific phone number.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {string} phone - Target phone number
 * @returns {Promise<object>} Object indicating success status, count, and fetched messages
 */
async function fetchHistoryForPhone(bot, phone) {
  if (!bot.sock) return { success: false, error: 'Bot not connected' };
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
  else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

  try {
    console.log(`📂 Fetching older message chunks for ${cleaned} [BYPASSED — fetchMessagesFromWA is deprecated]`);
    return { success: true, count: 0, messages: getChatHistory(bot, cleaned) };
  } catch (err) {
    console.error('❌ fetchHistory error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Evaluates configured auto-responders against incoming messages and sends matching replies.
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @param {string} remoteJid - Destination WhatsApp JID
 * @param {string} tagToApply - Associated Shopify flag to apply
 * @param {boolean} pendingCOD - Whether this order has pending cash on delivery
 * @param {string} orderRef - Shopify order reference ID/Number
 * @returns {Promise<void>}
 */
async function sendAutoResponderReply(bot, remoteJid, tagToApply, pendingCOD, orderRef) {
  let autoResponders = [];
  try {
    const settings = db.prepare('SELECT auto_responders FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    if (settings && settings.auto_responders) {
      autoResponders = JSON.parse(settings.auto_responders);
    }
  } catch (e) {
    console.error('Failed to fetch auto_responders in eventRouter:', e.message);
  }

  // Get store name
  let storeName = 'TracePK';
  let orderRow;
  try {
    orderRow = db.prepare('SELECT store_id, price, customer_name FROM orders WHERE id = ?').get(pendingCOD.order_id);
    if (orderRow) {
      const storeRow = db.prepare('SELECT store_name FROM stores WHERE id = ?').get(orderRow.store_id);
      if (storeRow && storeRow.store_name) {
        storeName = storeRow.store_name;
      }
    }
  } catch (_) {}

  const name = orderRow && orderRow.customer_name ? orderRow.customer_name.split(' ')[0] : 'Customer';
  const amount = orderRow && orderRow.price !== undefined && orderRow.price !== null ? orderRow.price : 'N/A';

  const formatAutoReply = (text) => {
    if (!text) return '';
    return text
      .replace(/\{ref\}/gi, orderRef)
      .replace(/\{amount\}/gi, amount)
      .replace(/\{name\}/gi, name)
      .replace(/\{first_name\}/gi, name)
      .replace(/\{store_name\}/gi, storeName);
  };

  // Map tag to trigger
  let triggerKey = '';
  if (tagToApply === 'Trace: Confirmed') triggerKey = '1';
  else if (tagToApply === 'Trace: Cancelled') triggerKey = '2';
  else if (tagToApply === 'Trace: Edit Requested') triggerKey = '3';
  else if (tagToApply === 'Trace: Manual Review') triggerKey = 'fallback';

  // Try to find matching responder
  const matchingRule = autoResponders.find(r => String(r.trigger).trim().toLowerCase() === triggerKey);
  let replyMessage = '';
  if (matchingRule && matchingRule.response) {
    replyMessage = formatAutoReply(matchingRule.response);
  }

  // Fallbacks if no matching rule or response is empty
  if (!replyMessage) {
    if (tagToApply === 'Trace: Confirmed') {
      replyMessage = `🎉 Thank you! Your order ${orderRef} is confirmed and will be dispatched shortly. 📦`;
    } else if (tagToApply === 'Trace: Cancelled') {
      replyMessage = `Your order ${orderRef} has been cancelled. We hope to serve you again soon! 🙏`;
    } else if (tagToApply === 'Trace: Edit Requested') {
      replyMessage = `✏️ No worries! Please reply with your updated size or address, and we will update it for you. 📝`;
    }
  }

  if (replyMessage) {
    try {
      await bot.sendMessage(remoteJid, replyMessage, false);
    } catch (err) {
      console.error(`Failed to send auto-reply for tag ${tagToApply}:`, err.message);
    }
  }
}

/**
 * Initiates complete history sync from WhatsApp servers (deprecated in current layout).
 * 
 * @param {object} bot - The WhatsApp bot instance
 * @returns {Promise<void>}
 */
async function syncDeepHistory(bot) {
  if (!bot.sock) return;
  console.log('🔄 Deep History Sync bypassed (legacy fetchMessagesFromWA is deprecated).');
}

module.exports = {
  handlePresenceUpdate,
  handleMessagingHistorySet,
  handleMessagesUpdate,
  handleMessagesUpsert,
  getChatHistory,
  fetchHistoryForPhone,
  syncDeepHistory
};
