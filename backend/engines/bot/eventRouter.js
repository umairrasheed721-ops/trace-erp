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

async function handleMessagesUpdate(bot, updates) {
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

    if (update.pollUpdates && key.remoteJid && !key.remoteJid.includes('@g.us')) {
      try {
        const remoteJid = key.remoteJid;
        const fromPhone = remoteJid.split('@')[0];
        
        let selectedOption = null;
        let trueRemoteJid = remoteJid;
        let vaultSecret = null;
        let vaultOptions = null;
        let dbPoll = null;

        try {
          dbPoll = db.prepare(
            `SELECT remote_jid, message_secret, poll_options FROM whatsapp_polls WHERE message_id = ?`
          ).get(key.id);
          if (dbPoll) {
            if (dbPoll.remote_jid) {
              trueRemoteJid = dbPoll.remote_jid;
            }
            vaultSecret = dbPoll.message_secret;
            vaultOptions = dbPoll.poll_options;
          }
        } catch (e) {
          console.error('⚠️ [PollVault] DB query failed in handleMessagesUpdate:', e.message);
        }

        // Resolve candidates
        let pollOptions = [];
        try {
          if (vaultOptions) {
            pollOptions = JSON.parse(vaultOptions);
          } else if (dbPoll && dbPoll.poll_options) {
            pollOptions = JSON.parse(dbPoll.poll_options);
          }
        } catch (_) {}

        if (dbPoll && vaultSecret && pollOptions.length > 0) {
          for (const updateItem of update.pollUpdates) {
            try {
              const { decryptPollVote } = await import('@whiskeysockets/baileys');
              const secretBuf = Buffer.from(vaultSecret, 'hex');
              const voterJid = key.participant || remoteJid;
              
              const decrypted = decryptPollVote(updateItem.vote, {
                pollCreatorJid: bot.sock?.user?.id || remoteJid,
                pollMsgId: key.id,
                pollEncKey: secretBuf,
                voterJid: voterJid
              });
              
              if (decrypted && decrypted.selectedOptions) {
                selectedOption = resolveSelectedOptionFromHashes(decrypted.selectedOptions, pollOptions);
              }
            } catch (decErr) {
              console.error('⚠️ [PollVault] Direct poll vote decryption failed in eventRouter:', decErr.message);
            }
            if (selectedOption) break;
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
  const jid = cleaned + '@s.whatsapp.net';

  try {
    console.log(`📂 Fetching older message chunks from WhatsApp for ${cleaned}...`);
    let fetched = [];
    if (typeof bot.sock.fetchMessagesFromWA === 'function') {
      try {
        fetched = await bot.sock.fetchMessagesFromWA(jid, 50) || [];
        for (const msg of fetched) {
          if (!msg.message) continue;
          if (!bot.store.messages[jid]) bot.store.messages[jid] = [];
          if (!bot.store.messages[jid].some(m => m.key.id === msg.key.id)) {
            bot.store.messages[jid].push(msg);
          }
        }
      } catch (e) {
        console.warn('⚠️ fetchMessagesFromWA error:', e.message);
      }
    }
    return { success: true, count: fetched.length, messages: getChatHistory(bot, cleaned) };
  } catch (err) {
    console.error('❌ fetchHistory error:', err.message);
    return { success: false, error: err.message };
  }
}

async function syncDeepHistory(bot) {
  if (!bot.sock) return;
  console.log('🔄 Starting Deep History Sync for active customers...');
  
  let downloadMediaMessage;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    downloadMediaMessage = baileys.downloadMediaMessage;
  } catch (err) {
    console.error('⚠️ Failed to load downloadMediaMessage from Baileys:', err.message);
  }
  
  const activeCustomers = db.prepare(`
    SELECT DISTINCT phone, id as order_id, store_id 
    FROM orders 
    WHERE phone IS NOT NULL AND phone != ''
    ORDER BY id DESC 
    LIMIT 50
  `).all();

  console.log(`📱 Found ${activeCustomers.length} active customers to sync.`);

  for (const customer of activeCustomers) {
    let cleaned = customer.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
    const jid = cleaned + '@s.whatsapp.net';

    try {
      console.log(`📥 Syncing history for +${cleaned}...`);
      await new Promise(r => setTimeout(r, 600));

      let fetched = [];
      if (typeof bot.sock.fetchMessagesFromWA === 'function') {
        fetched = await bot.sock.fetchMessagesFromWA(jid, 50) || [];
      } else {
        console.warn('⚠️ fetchMessagesFromWA is not a function on bot.sock');
        break;
      }

      let newMsgsCount = 0;
      for (const msg of fetched) {
        if (!msg.message) continue;
        
        const messageId = msg.key.id;
        const exists = db.prepare('SELECT id FROM whatsapp_messages WHERE message_id = ?').get(messageId);
        if (exists) continue;

        const isOutgoing = msg.key.fromMe;
        const text = getMessageText(msg);
        const mediaDetails = getMessageMediaDetails(msg);

        let mediaUrl = null;
        let mediaType = null;
        let driveFileId = null;
        
        if (mediaDetails && downloadMediaMessage) {
          mediaType = mediaDetails.type;
          const mediaResult = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
          if (mediaResult) {
            mediaUrl = mediaResult.url;
            driveFileId = mediaResult.id;
          }
        }

        const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');
        const timestampSec = Number(msg.messageTimestamp) || Date.now() / 1000;
        const createdAt = new Date(timestampSec * 1000).toISOString().replace('T', ' ').substring(0, 19);

        db.prepare(`
          INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, created_at, drive_file_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
        `).run(
          customer.store_id || 1,
          customer.order_id,
          cleaned,
          isOutgoing ? 'outgoing' : 'incoming',
          finalMessage,
          messageId,
          mediaUrl,
          mediaType,
          createdAt,
          driveFileId
        );

        newMsgsCount++;
      }
      
      if (newMsgsCount > 0) {
        console.log(`✅ Synced ${newMsgsCount} new messages for +${cleaned}`);
      }
    } catch (err) {
      console.error(`❌ Error syncing history for +${cleaned}:`, err.message);
    }
  }
  console.log('🔄 Deep History Sync completed!');
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
