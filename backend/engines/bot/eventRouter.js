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
        if (order) {
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

      try {
        db.prepare("UPDATE whatsapp_messages SET status = ? WHERE message_id = ?").run(statusStr, messageId);
      } catch (e) {}

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
              const query = `UPDATE whatsapp_polls SET erp_status = ? WHERE order_id = ?`;
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

              if (isConfirm) {
                // ✅ CONFIRM ORDER
                db.prepare(`UPDATE cod_pending_verifications SET status = 'confirmed', replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(pendingCOD.id);
                db.prepare(`UPDATE orders SET wa_verification_status = 'verified', payment_status = 'COD Confirmed', delivery_status = 'confirmed' WHERE id = ?`).run(pendingCOD.order_id);
                const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                if (order) {
                  const { broadcast } = require('../../sse');
                  broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                }
                await bot.sendMessage(fromPhone, `🎉 Thank you! Your order ${orderRef} is confirmed and will be dispatched shortly. 📦`, false);
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
                await bot.sendMessage(fromPhone, `✏️ No worries! Please reply with your updated size or address, and we will update it for you. 📝`, false);
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
                await bot.sendMessage(fromPhone, `Your order ${orderRef} has been cancelled. We hope to serve you again soon! 🙏`, false);
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
}


function handleMessagesUpsert(bot, m) {
  const { messages, type } = m;
  if (type !== 'notify' && type !== 'append') return;
  for (const msg of messages) {

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
