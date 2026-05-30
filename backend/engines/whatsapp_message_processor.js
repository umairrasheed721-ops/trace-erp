const path = require('path');
const fs = require('fs');
const { transcodeToOpus, safeUnlink, TAG: FFMPEG_TAG } = require('./ffmpeg_transcode');

function getSecureMediaPath(fileName) {
  const paths = [
    path.join('/app/data/media', fileName),
    path.join('/app/data/uploads', fileName),
    path.join(process.cwd(), 'data', 'media', fileName)
  ];
  for (const p of paths) {
    if (require('fs').existsSync(p)) return p;
  }
  return null; // Return null instead of crashing
}


async function analyzeCustomerIntent(text) {
  try {
    const { db } = require('../db');
    const settings = db.prepare('SELECT api_key, model_name FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || !settings.api_key) {
      return 'General';
    }

    const map = {
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-pro'
    };
    const model = map[settings.model_name] || settings.model_name || 'gemini-2.5-flash';
    const apiKey = settings.api_key;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Analyze this e-commerce customer message and return a single tag from this list: [Urgent, Size Issue, Pricing, Address Update, General]. If none match, return 'General'. Message: ${text}`;

    const payload = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    };

    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return 'General';
    }

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanTag = replyText.replace(/[^a-zA-Z\s]/g, '').trim();
    const validTags = ['Urgent', 'Size Issue', 'Pricing', 'Address Update', 'General'];
    const matched = validTags.find(t => t.toLowerCase() === cleanTag.toLowerCase());
    return matched || 'General';
  } catch (err) {
    console.error('⚠️ analyzeCustomerIntent error:', err.message);
    return 'General';
  }
}


const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};

function normalizePhone(raw) {
  if (!raw) return '';
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  if (n.startsWith('0') && n.length === 11) n = '92' + n.substring(1);
  else if (!n.startsWith('92') && n.length === 10) n = '92' + n;
  return n;
}

function getPhoneFromJid(msg, db) {
  if (!msg || !msg.key) return '';
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return '';
  
  const cleanJid = remoteJid.split('@')[0];
  
  if (remoteJid.endsWith('@lid')) {
    if (msg.key.senderPn) {
      const phone = msg.key.senderPn.split('@')[0];
      try {
        db.prepare(`
          INSERT INTO wa_lid_mappings (lid, phone)
          VALUES (?, ?)
          ON CONFLICT(lid) DO UPDATE SET phone = excluded.phone
        `).run(cleanJid, phone);
      } catch (e) {
        console.error('⚠️ Failed to save LID mapping:', e.message);
      }
      return phone;
    }
    
    try {
      const row = db.prepare('SELECT phone FROM wa_lid_mappings WHERE lid = ?').get(cleanJid);
      if (row) return row.phone;
    } catch (e) {}
  }
  
  return cleanJid;
}

function getMessageMediaDetails(msg) {
  const m = msg.message;
  if (!m) return null;

  const content = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;

  if (content.imageMessage) {
    return { type: 'image', mimeType: content.imageMessage.mimetype, caption: content.imageMessage.caption || '', fileName: null };
  } else if (content.documentMessage) {
    return { type: 'document', mimeType: content.documentMessage.mimetype, caption: content.documentMessage.caption || '', fileName: content.documentMessage.fileName || 'document.pdf' };
  } else if (content.audioMessage) {
    return { type: 'audio', mimeType: content.audioMessage.mimetype, caption: '', fileName: content.audioMessage.ptt ? 'voice_note.mp4' : 'audio.mp4' };
  } else if (content.videoMessage) {
    return { type: 'video', mimeType: content.videoMessage.mimetype, caption: content.videoMessage.caption || '', fileName: null };
  }
  return null;
}

function getMessageText(msg) {
  const m = msg.message;
  if (!m) return '';

  const content = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;

  if (content.interactiveResponseMessage) {
    const intResp = content.interactiveResponseMessage;
    if (intResp.body?.text) return intResp.body.text;
    if (intResp.nativeFlowResponseMessage?.paramsJson) {
      try {
        const parsed = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson);
        if (parsed.id) return parsed.id;
      } catch (e) {}
    }
  }

  return content.conversation || 
         content.extendedTextMessage?.text || 
         content.buttonsResponseMessage?.selectedDisplayText || 
         content.templateButtonReplyMessage?.selectedDisplayText || 
         content.buttonsResponseMessage?.selectedButtonId ||
         content.templateButtonReplyMessage?.selectedId ||
         content.imageMessage?.caption || 
         content.documentMessage?.caption || 
         content.videoMessage?.caption || 
         '';
}

async function saveMediaFile(msg, mediaDetails, downloadMediaMessage) {
  try {
    const { DB_DIR } = require('../db');
    const mediaDir = require('path').join(DB_DIR || '/app/data', 'media');
    if (!require('fs').existsSync(mediaDir)) {
      require('fs').mkdirSync(mediaDir, { recursive: true });
    }
    const fsPromises = require('fs').promises;
    const crypto = require('crypto');

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'audio/ogg; codecs=opus': 'ogg',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4'
    };

    let ext = 'bin';
    if (mediaDetails.mimeType) {
      const baseMime = mediaDetails.mimeType.split(';')[0].trim();
      ext = extMap[baseMime] || extMap[mediaDetails.mimeType] || baseMime.split('/')[1] || 'bin';
    }

    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.${ext}`;
    const filePath = path.join(mediaDir, fileName);

    console.log(`📥 Decrypting and downloading media for message ${msg.key.id} (${mediaDetails.mimeType})...`);
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: SILENT_LOGGER }
    );

    if (buffer) {
      await fsPromises.writeFile(filePath, buffer);
      console.log(`💾 Saved proxy media to secure local storage: ${filePath}`);
      return `/api/media/${fileName}`;
    }
  } catch (e) {
    console.warn(`⚠️ Failed to download media for message ${msg.key.id}:`, e.message);
  }
  return null;
}

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

    const { phone, message, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext, buttons, buttonsMode, poll } = activeQueue[0];
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
      
      if (isManual) {
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
      const typingDelay = Math.max(typingFloor, Math.min(charDelay + jitter, typingCap));
      console.log(`💬 [TYPING_SIM] ${isActiveChatSession ? 'Active' : 'Bulk'} | ${typingDelay}ms typing delay to ${cleaned}`);
      await new Promise(r => setTimeout(r, typingDelay));

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
        const isTextPayload = !payload.image && !payload.audio && !payload.video && !payload.document && !payload.poll && !payload.viewOnceMessage;
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
        while (true) {
          try {
            const options = { messageId: uuid };
            return await sock.sendMessage(jid, payload, options);
          } catch (err) {
            attempt++;
            if (attempt > 3) {
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
            values: poll.values,
            selectableCount: poll.selectableCount || 1
          }
        };
        sentMsg = await safeSend(jid, pollPayload);
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
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message || 'Please select an option:' },
                nativeFlowMessage: {
                  buttons: nativeButtons
                }
              }
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
            const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(path.resolve(mediaUrl)) ? path.resolve(mediaUrl) : null);
            if (!resolvedPath) {
              console.error(`${FFMPEG_TAG} SOURCE_MISSING path=${mediaUrl}`);
              resolve({ success: false, error: '[FFMPEG_ENCODE] Source audio file not found' });
              continue;
            }
            const absInputPath = resolvedPath;
            let transcodeOutputPath = null;
            let finalAudioBuffer;
            let finalMime = 'audio/ogg; codecs=opus';

            const inputSizeBytes = fs.statSync(absInputPath).size;
            console.log(`${FFMPEG_TAG} INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${finalMediaType}`);

            try {
              const result = await transcodeToOpus(absInputPath);
              transcodeOutputPath = result.outputPath;

              const outStat = fs.statSync(transcodeOutputPath);
              console.log(`${FFMPEG_TAG} OUTPUT path=${transcodeOutputPath}  size=${outStat.size}B  duration=${result.durationSec}s`);

              finalAudioBuffer = fs.readFileSync(transcodeOutputPath);

              if (finalAudioBuffer.length < 100) {
                throw new Error(`${FFMPEG_TAG} Output buffer suspiciously small (${finalAudioBuffer.length}B) — transcode likely failed`);
              }
            } catch (transcodeErr) {
              console.error(`${FFMPEG_TAG} TRANSCODE_FAIL  error=${transcodeErr.message}`);
              finalAudioBuffer = fs.readFileSync(absInputPath);
              finalMime = 'audio/mp4';
              console.warn(`${FFMPEG_TAG} FALLBACK  sending raw file with mime=audio/mp4`);
            }

            const payload = {
              audio: finalAudioBuffer,
              ptt: true,
              mimetype: finalMime,
            };

            if (pendingAckPath) {
              try {
                fs.writeFileSync(pendingAckPath, finalAudioBuffer);
                console.log(`[PENDING_ACK] Saved audio VN buffer to: ${pendingAckPath}`);
              } catch (err) {
                console.error('⚠️ Failed to save pending_ack voice note:', err.message);
              }
            }

            console.log(`${FFMPEG_TAG} SEND  jid=${jid}  mime=${finalMime}  bufSize=${finalAudioBuffer.length}B  ptt=true`);
            
            try {
              sentMsg = await safeSend(jid, payload);
            } finally {
              if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
                await safeUnlink(transcodeOutputPath);
              }
            }
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

  bot.isProcessing = false;
}

async function processIncomingMessage(bot, msg, sock, db) {
  if (!msg.message) return;
  
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us')) return;
  
  if (!bot.store.messages[remoteJid]) bot.store.messages[remoteJid] = [];
  bot.store.messages[remoteJid].push(msg);
  if (bot.store.messages[remoteJid].length > 100) bot.store.messages[remoteJid].shift();

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

  let tag = 'General';
  if (!isOutgoing && text) {
    tag = await analyzeCustomerIntent(text);
  }
  msg.intent_tag = tag;

  if (!isOutgoing && fromPhone) {
    bot.contactLastIncomingTimestamp[fromPhone] = Date.now();
    bot.activeChats.add(fromPhone);
    setTimeout(() => bot.activeChats.delete(fromPhone), 5 * 60 * 1000);
  }
  
  let mediaUrl = null;
  let mediaType = null;
  if (mediaDetails) {
    const existingMsg = db.prepare(`SELECT media_url FROM whatsapp_messages WHERE message_id = ?`).get(msg.key.id);
    if (existingMsg && existingMsg.media_url) {
      mediaUrl = existingMsg.media_url;
      mediaType = mediaDetails.type;
    } else {
      try {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
        mediaType = mediaDetails.type;
        mediaUrl = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
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

  const order = db.prepare(`SELECT id, store_id FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
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
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, quote_context, intent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
      `).run(storeId, orderId, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaUrl, mediaType, incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null, tag);
      dbMessageId = result.lastInsertRowid;
    }
  } catch (dbErr) {
    console.error('⚠️ DB Insert Failed for incoming message:', dbErr.message);
  }

  if (mediaType === 'audio' && mediaUrl && dbMessageId && !alreadyExists) {
    setImmediate(async () => {
      try {
        const { transcribeVoiceNote } = require('./stt_engine');
        const { DB_DIR } = require('../db');
        const absPath = mediaUrl.startsWith('/uploads/')
          ? require('path').join(DB_DIR, 'uploads', mediaUrl.substring(9))
          : require('path').join(DB_DIR, 'uploads', mediaUrl);
        await transcribeVoiceNote(fromPhone, dbMessageId, absPath);
      } catch(e) { console.error('STT dispatch error:', e.message); }
    });
  }

  if (mediaType === 'image' && mediaUrl && dbMessageId && !alreadyExists) {
    setImmediate(async () => {
      try {
        const { scanReceiptOCR } = require('./ocr_engine');
        const { DB_DIR } = require('../db');
        const absPath = mediaUrl.startsWith('/uploads/')
          ? require('path').join(DB_DIR, 'uploads', mediaUrl.substring(9))
          : require('path').join(DB_DIR, 'uploads', mediaUrl);
        await scanReceiptOCR(fromPhone, orderId, dbMessageId, absPath);
      } catch(e) { console.error('OCR dispatch error:', e.message); }
    });
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
    bot.humanCooldowns[fromPhone] = Date.now();
    console.log(`👤 Human manual message detected for ${fromPhone}. Bot auto-replies paused for 30 mins.`);
    
    const until = Date.now() + 15 * 60 * 1000;
    try {
      db.prepare(`
        INSERT INTO customer_profiles (phone, human_handoff_until, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET human_handoff_until = ?, updated_at = datetime('now')
      `).run(fromPhone, String(until), String(until));
      console.log(`🧑 [HANDOFF_LOCK] Set 15-minute handoff lock in DB for ${fromPhone} due to outgoing human message.`);
    } catch (e) {
      console.error('⚠️ Failed to set human handoff lock in DB:', e.message);
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
  if (lastHumanMsg && (Date.now() - lastHumanMsg) < 30 * 60 * 1000) {
    console.log(`⏳ Skipping bot auto-reply for ${fromPhone} due to active human manual override.`);
    return;
  }

  try {
    const pendingCOD = db.prepare(
      `SELECT * FROM cod_pending_verifications WHERE phone = ? AND status = 'pending'
       AND expires_at > datetime('now', '+5 hours') ORDER BY id DESC LIMIT 1`
    ).get(fromPhone);

    if (pendingCOD) {
      const reply = text ? text.toLowerCase().trim() : '';
      const isConfirm = reply === '1' || ['confirm', 'yes', 'haan', 'ji', 'ok', 'bilkul'].some(w => reply.includes(w));
      const isCancel = reply === '2' || ['cancel', 'nahi', 'na', 'no', 'nain'].some(w => reply.includes(w));

      if (isConfirm || isCancel) {
        const newStatus = isConfirm ? 'confirmed' : 'cancelled';
        db.prepare(`UPDATE cod_pending_verifications SET status = ?, replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(newStatus, pendingCOD.id);
        
        if (isConfirm) {
          db.prepare(`UPDATE orders SET wa_verification_status = 'verified', payment_status = 'COD Confirmed' WHERE id = ?`).run(pendingCOD.order_id);
          await bot.sendMessage(fromPhone, `✅ *Shukriya!* Aapka COD order *confirm* ho gaya hai. Insha'Allah 2-3 working days mein deliver ho jayega. 📦`, true);
          console.log(`🔐 COD Confirmed: Order ${pendingCOD.order_id} by ${fromPhone}`);
        } else {
          db.prepare(`UPDATE orders SET payment_status = 'COD Cancelled' WHERE id = ?`).run(pendingCOD.order_id);
          await bot.sendMessage(fromPhone, `❌ Aapka order cancel note kar liya gaya hai. Agar dobara order karna chahein toh hamari website visit karein. JazakAllah! 🙏`, true);
          console.log(`🔐 COD Cancelled: Order ${pendingCOD.order_id} by ${fromPhone}`);
        }
        return;
      }
    }
  } catch (codErr) {
    console.error('🔐 COD interceptor error:', codErr.message);
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
      bot.sendMessage(fromPhone, "🤖 [TRACE Support] Aapko support agent queue mein add kar diya gaya hai. Hamare representative jald hi aapse raabta karenge. Shukriya! 🙏", true);
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
      bot.sendMessage(fromPhone, "🤖 [TRACE Support] Aapko unsubscribe kar diya gaya hai. Ab aapko automated messages nahi milenge. Agar dobara activate karna ho toh 'Start' reply karein.", true);
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
      bot.sendMessage(fromPhone, "🤖 [TRACE Support] Automated help dobara activate kar di gayi hai. Aap kaisa help chahte hain?", true);
      return;
    }

    const profile = db.prepare('SELECT opted_out FROM customer_profiles WHERE phone = ?').get(fromPhone);
    if (profile && profile.opted_out === 1) {
      console.log(`🔕 Skipping bot reply for ${fromPhone} because customer is opted out.`);
      return;
    }

    const order = db.prepare(`SELECT id, store_id, tracking_number, courier, delivery_status, wa_verification_status, address FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(fromPhone.length - 10)}%`);
    const orderId = order ? order.id : null;
    const storeId = order ? order.store_id : 1;

    db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
      VALUES (?, ?, ?, 'incoming', ?)
    `).run(storeId, orderId, fromPhone, text);

    const wismoKeywords = ['kahan', 'kahan hai', 'tracking', 'track', 'status', 'kab aayega', 'kab ayega', 'parcel', 'where is', 'where is my order', 'wismo', 'order kahan', 'consignment', 'delivery kab'];
    const isWismo = wismoKeywords.some(w => lowerText.includes(w));
    if (isWismo && orderId) {
      const wismoOrder = db.prepare('SELECT tracking_number, courier, delivery_status, status_date FROM orders WHERE id = ?').get(orderId);
      if (wismoOrder && wismoOrder.tracking_number) {
        const tracking = wismoOrder.tracking_number;
        const courier = wismoOrder.courier || 'Courier';
        const status = wismoOrder.delivery_status || 'In Transit';
        const trackLink = courier === 'PostEx'
          ? `https://api.postex.pk/services/integration/api/order/v1/track-order/${tracking}`
          : `https://one-be.instaworld.pk/logistics/v1/trackShipment?tracking=${tracking}`;
        const wismoReply = `📦 *Order Status Update*\n\nTracking: *${tracking}* (${courier})\nCurrent Status: *${status}*\n\n🔗 Live Track: ${trackLink}\n\nKoi aur sawaal ho toh zaroor batayein! 😊`;
        
        if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
          console.warn(`⚠️ [RATE-LIMIT] Skipping WISMO reply to ${fromPhone} — 2 consecutive bot replies without response.`);
        } else {
          bot.sendMessage(fromPhone, wismoReply, true);
          bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
          console.log(`🚚 WISMO fast-intercept replied to ${fromPhone}`);
        }
        return;
      }
    }

    const { generateAIResponse } = require('./gemini_engine');
    const geminiReply = await generateAIResponse(fromPhone, text);
    if (geminiReply) {
      const handoffKeywords = ['human agent', 'human support', 'live agent', 'connect you to', 'escalat', 'transfer you'];
      const needsHandoff = handoffKeywords.some(kw => geminiReply.toLowerCase().includes(kw));
      if (needsHandoff) {
        bot.setHumanHandoff(fromPhone, true);
        try {
          const { broadcast } = require('../websocket');
          broadcast('human_handoff_required', { phone: fromPhone, reason: 'Gemini AI flagged handoff', preview: geminiReply.substring(0, 120) });
        } catch (_) {}
      }
      if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
        console.warn(`⚠️ [RATE-LIMIT] Skipping Gemini reply to ${fromPhone} — 2 consecutive bot replies without response.`);
      } else {
        bot.sendMessage(fromPhone, geminiReply, true);
        bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
      }
      return;
    }

    const settings = db.prepare('SELECT ai_responder_enabled, ai_tracking_template, ai_landmark_template FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
    
    if (orderId) {
      if (['confirm', 'yes', 'haan', 'ji', 'ok', 'verify', 'y'].some(w => lowerText.includes(w))) {
        db.prepare(`UPDATE orders SET wa_verification_status = 'Verified' WHERE id = ?`).run(orderId);
        console.log(`✅ Auto-verified order #${orderId} via WA reply!`);
      }

      if (settings.ai_responder_enabled !== 0) {
        if (['kahan', 'tracking', 'status', 'kab aayega', 'parcel', 'where is', 'track'].some(w => lowerText.includes(w))) {
          const tracking = order.tracking_number || 'N/A';
          const courier = order.courier || 'Courier';
          const status = order.delivery_status || 'In Transit';
          const link = order.courier === 'PostEx' ? `https://api.postex.pk/services/integration/api/order/v1/track-order/${tracking}` : `https://one-be.instaworld.pk/logistics/v1/trackShipment?tracking=${tracking}`;
          
          let reply = (settings.ai_tracking_template || '🤖 [TRACE Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}')
            .replace(/\{tracking\}/g, tracking)
            .replace(/\{courier\}/g, courier)
            .replace(/\{status\}/g, status)
            .replace(/\{link\}/g, link);

          if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
            console.warn(`⚠️ [RATE-LIMIT] Skipping fallback tracking reply to ${fromPhone} — rate limit hit.`);
          } else {
            bot.sendMessage(fromPhone, reply, true);
            bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
            console.log(`🤖 AI Fallback: Sent Tracking Intent reply to ${fromPhone}`);
          }
        }
        else if (['near', 'opposite', 'beside', 'gali', 'house', 'makan', 'street', 'landmark', 'ke paas', 'samne'].some(w => lowerText.includes(w))) {
          db.prepare(`UPDATE orders SET cs_notes = IFNULL(cs_notes, '') || ' [WA Landmark: ' || ? || ']' WHERE id = ?`).run(text, orderId);
          
          let reply = (settings.ai_landmark_template || '🤖 [TRACE Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.')
            .replace(/\{landmark\}/g, text);

          if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
            console.warn(`⚠️ [RATE-LIMIT] Skipping fallback landmark reply to ${fromPhone} — rate limit hit.`);
          } else {
            bot.sendMessage(fromPhone, reply, true);
            bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
            console.log(`🤖 AI Fallback: Sent Landmark Intent reply to ${fromPhone}`);
          }
        }
        else {
          const customerName = order.customer_name || 'Customer';
          const reply = `🤖 [TRACE Support] Hi *${customerName}*! Humare system mein aapka order exist karta hai. Agar aap apna parcel track karna chahte hain, toh reply mein *'kahan hai'* ya *'status'* likh kar bhejein. Shukriya!`;
          if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
            console.warn(`⚠️ [RATE-LIMIT] Skipping fallback general-order reply to ${fromPhone} — rate limit hit.`);
          } else {
            bot.sendMessage(fromPhone, reply, true);
            bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
            console.log(`🤖 AI Fallback: Sent general order holder message to ${fromPhone}`);
          }
        }
      }
    } else {
      if (['kahan', 'tracking', 'status', 'kab aayega', 'parcel', 'where is', 'track'].some(w => lowerText.includes(w))) {
        const reply = `🤖 [TRACE Support] Aapka phone number humare system mein kisi active order se register nahi mila. Agar aapne order kiya hai, toh kindly humein apna *order number* (e.g. TR12345) message karein taake hum update check kar sakein.`;
        if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
          console.warn(`⚠️ [RATE-LIMIT] Skipping fallback no-order-tracking reply to ${fromPhone} — rate limit hit.`);
        } else {
          bot.sendMessage(fromPhone, reply, true);
          bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
          console.log(`🤖 AI Fallback: Sent tracking request message to non-order holder ${fromPhone}`);
        }
      } else {
        const reply = `🤖 [TRACE Support] Salam! Aapka message received ho gaya hai. Humare system mein is number se koi current order exist nahi karta. Agar aap new order place karna chahte hain ya agent se baat karna chahte hain, toh apna query reply karein. Humara customer support representative jald hi aapse raabta karega.`;
        if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 2) {
          console.warn(`⚠️ [RATE-LIMIT] Skipping fallback general-help reply to ${fromPhone} — rate limit hit.`);
        } else {
          bot.sendMessage(fromPhone, reply, true);
          bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;
          console.log(`🤖 AI Fallback: Sent general help reply to non-order holder ${fromPhone}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error processing incoming WA message:', err.message);
  }
}

module.exports = {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  saveMediaFile,
  processQueue,
  processIncomingMessage
};
