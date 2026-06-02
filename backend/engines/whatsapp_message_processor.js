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
  // Normalize double country code 9292 -> 92
  if (n.startsWith('9292') && n.length > 12) {
    n = n.substring(2);
  }
  // Normalize 9203 -> 923
  if (n.startsWith('920') && n.length === 13) {
    n = '92' + n.substring(3);
  }
  // Normalize 03 -> 923
  if (n.startsWith('0') && n.length === 11) {
    n = '92' + n.substring(1);
  }
  // Normalize 3 -> 923
  else if (!n.startsWith('92') && n.length === 10) {
    n = '92' + n;
  }
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

  if (content.listResponseMessage) {
    const listResp = content.listResponseMessage;
    if (listResp.singleSelectReply?.selectedRowId) {
      return listResp.singleSelectReply.selectedRowId;
    }
    if (listResp.title) return listResp.title;
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
  console.log('📸 Media received, attempting Drive upload...');
  try {
    const crypto = require('crypto');
    const { uploadBufferToDrive } = require('../services/googleDrive');

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

    console.log(`📥 Decrypting and downloading media for message ${msg.key.id} (${mediaDetails.mimeType})...`);
    let buffer;
    try {
      buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger: SILENT_LOGGER }
      );
    } catch (downloadErr) {
      console.error('❌ Baileys media decryption failed:', downloadErr.message);
      return null;
    }

    if (buffer) {
      console.log(`💾 Offloading WhatsApp media directly to Google Drive: ${fileName}`);
      
      // Wrap the entire Drive upload block in a robust try...catch
      try {
        const driveFile = await uploadBufferToDrive(buffer, fileName, mediaDetails.mimeType);
        if (driveFile) {
          console.log('✅ Drive upload successful');
          console.log(`📡 Media successfully offloaded to Drive: ID=${driveFile.id}, URL=${driveFile.url}`);
          return { url: driveFile.url, id: driveFile.id };
        } else {
          console.warn(`⚠️ Google Drive upload returned null for message ${msg.key.id}`);
        }
      } catch (uploadErr) {
        console.error('❌ Drive Upload Failed:', uploadErr.message);
      }
    }
  } catch (error) {
    console.error('❌ Drive Upload Failed:', error.message);
  }
  return null;
}

const FORMAL_COD_TEMPLATE = `Dear [Name],\n\nThis is a formal verification request for your Cash on Delivery order [OrderID] of Rs [Price]. Please confirm your order by replying to this message.\n\nThank you for choosing TRACE.`;
const FORMAL_SHIPPING_TEMPLATE = `Dear [Name],\n\nWe are pleased to inform you that your order [OrderID] has been shipped via [Courier].\n\nTracking Number: [Tracking]\nLive Tracking Link: [Link]\n\nThank you for shopping with us.`;

function detectOutboundType(message, poll) {
  const text = String(message || '').toLowerCase();
  if (
    text.includes('cod order verification') || 
    text.includes('confirm your order') || 
    text.includes('verify order') || 
    text.includes('confirm order') ||
    text.includes('verification voice note') ||
    (poll && poll.name && poll.name.toLowerCase().includes('cod'))
  ) {
    return 'COD Verification';
  }
  if (
    text.includes('shipped') || 
    text.includes('tracking') || 
    text.includes('courier') || 
    text.includes('track order') || 
    text.includes('tracking id') ||
    text.includes('order status update')
  ) {
    return 'Shipping Update';
  }
  return null;
}

function formatTemplate(templateStr, orderInfo) {
  if (!templateStr) return '';
  const name = orderInfo?.customer_name || 'Customer';
  const orderId = orderInfo?.id || 'N/A';
  const price = orderInfo?.price || 'N/A';
  const courier = orderInfo?.courier || 'Courier';
  const tracking = orderInfo?.tracking_number || 'N/A';
  const link = tracking 
    ? (courier === 'PostEx' 
        ? `https://api.postex.pk/services/integration/api/order/v1/track-order/${tracking}` 
        : `https://one-be.instaworld.pk/logistics/v1/trackShipment?tracking=${tracking}`) 
    : 'N/A';

  return templateStr
    .replace(/\[Name\]/g, name)
    .replace(/\[OrderID\]/g, orderId)
    .replace(/\[Price\]/g, price)
    .replace(/\[Courier\]/g, courier)
    .replace(/\[Tracking\]/g, tracking)
    .replace(/\[Link\]/g, link);
}

function cleanAndShortenForHuman(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/🤖\s*\[TRACE Support\]\s*/gi, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/[😊👍📦🙏✨🔘✅❌]/g, '')
    .trim();

  const lower = cleaned.toLowerCase();

  if (lower.includes('verification request') || lower.includes('confirm your order') || lower.includes('confirm order')) {
    return "Hi, order confirm krne k liye yes/confirm likh kr reply krden please.";
  }

  if (lower.includes('shipped') || lower.includes('tracking number') || lower.includes('tracking:')) {
    const trackingMatch = cleaned.match(/Tracking(?:\s*Number)?:\s*(\w+)/i) || cleaned.match(/([A-Z0-9-]{8,20})/i);
    const tracking = trackingMatch ? trackingMatch[0] : '';
    if (tracking) {
      return `Aapka order ship ho chuka hai. Tracking number ye hai: ${tracking}`;
    }
    return "Aapka order ship ho chuka hai. Hum tracking details share krdetey hain aapse.";
  }

  if (lower.includes('humare system mein aapka order exist')) {
    return "Aapka order humare paas registered hai, koi help chahiye toh batayein.";
  }

  if (lower.includes('automated help') || lower.includes('unsubscribe')) {
    return "Aapko help message nahi milenge ab.";
  }

  cleaned = cleaned.replace(/^Dear\s+[A-Za-z0-9\s]+,?\s*/i, '');
  cleaned = cleaned.replace(/^Hi\s+[A-Za-z0-9\s]+,?\s*/i, '');
  cleaned = cleaned.replace(/^Salam\s+[A-Za-z0-9\s]*!,?\s*/i, '');
  
  if (cleaned.length > 100) {
    const sentences = cleaned.split(/[.!?\n]/);
    if (sentences.length > 0 && sentences[0].trim().length > 10) {
      cleaned = sentences[0].trim() + '.';
    }
  }

  return cleaned;
}

function adaptiveStrategy(phone, messageItem, db, isManual = false) {
  const cleanedPhone = (phone || '').replace(/\D/g, '');
  let hasComplained = false;
  try {
    const rows = db.prepare(`
      SELECT message, intent FROM whatsapp_messages 
      WHERE phone = ? AND direction = 'incoming' 
      ORDER BY id DESC LIMIT 3
    `).all(cleanedPhone);
    
    const complaintKeywords = [
      'complain', 'complaint', 'why not visible', 'not visible', 'refund', 'fraud',
      'scam', 'cheat', 'defective', 'damaged', 'broken', 'wrong item', 'fake',
      'bad service', 'worst service', 'shikayat', 'kharab', 'wapas'
    ];

    for (const row of rows) {
      const msgText = String(row.message || '').toLowerCase();
      const isComplaintText = complaintKeywords.some(kw => msgText.includes(kw));
      if (isComplaintText || row.intent === 'triage') {
        hasComplained = true;
        break;
      }
    }
  } catch (err) {
    console.error('⚠️ Error checking complaints in adaptiveStrategy:', err.message);
  }

  const messageType = detectOutboundType(messageItem.message, messageItem.poll);
  let updatedMessage = messageItem.message;

  let orderInfo = null;
  try {
    orderInfo = db.prepare(`
      SELECT id, customer_name, price, courier, tracking_number 
      FROM orders 
      WHERE phone LIKE ? 
      ORDER BY id DESC LIMIT 1
    `).get(`%${cleanedPhone.substring(cleanedPhone.length - 10)}%`);
  } catch (err) {
    console.error('⚠️ Error querying order in adaptiveStrategy:', err.message);
  }

  if (messageType === 'COD Verification') {
    let templateStr = FORMAL_COD_TEMPLATE;
    try {
      const templateRow = db.prepare("SELECT content FROM whatsapp_templates WHERE type = 'confirmation' AND is_default = 1").get();
      if (templateRow && templateRow.content) {
        templateStr = templateRow.content;
      }
    } catch (e) {}
    updatedMessage = formatTemplate(templateStr, orderInfo);
  } else if (messageType === 'Shipping Update') {
    let templateStr = FORMAL_SHIPPING_TEMPLATE;
    try {
      const templateRow = db.prepare("SELECT content FROM whatsapp_templates WHERE type = 'shipping' AND is_default = 1").get();
      if (templateRow && templateRow.content) {
        templateStr = templateRow.content;
      }
    } catch (e) {}
    updatedMessage = formatTemplate(templateStr, orderInfo);
  }

  if (hasComplained) {
    messageItem.quoteContext = null;
    messageItem.buttons = null;
    messageItem.buttonsMode = null;
    messageItem.poll = null;

    const isRealManual = isManual && !messageType;
    if (!isRealManual) {
      updatedMessage = cleanAndShortenForHuman(updatedMessage);
    }
  }

  return {
    ...messageItem,
    message: updatedMessage,
    hasComplained: hasComplained
  };
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

        // Track this ID before sending to prevent a race condition where the outgoing echo event 
        // is processed by the incoming message handler before sock.sendMessage resolves.
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
             const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(path.resolve(mediaUrl)) ? path.resolve(mediaUrl) : null);
             if (!resolvedPath) {
               console.warn(`${FFMPEG_TAG} SOURCE_MISSING local path for=${mediaUrl}. Falling back to URL payload.`);
               const payload = {
                 audio: { url: mediaUrl },
                 ptt: true,
                 mimetype: 'audio/mp4'
               };
               sentMsg = await safeSend(jid, payload);
             } else {
               const absInputPath = resolvedPath;
               let transcodeOutputPath = null;
               let finalAudioBuffer = null;
               let finalMime = 'audio/ogg; codecs=opus';

               try {
                 const inputSizeBytes = fs.statSync(absInputPath).size;
                 console.log(`${FFMPEG_TAG} INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${finalMediaType}`);
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
                 try {
                   finalAudioBuffer = fs.readFileSync(absInputPath);
                   finalMime = 'audio/mp4';
                   console.warn(`${FFMPEG_TAG} FALLBACK  sending raw file with mime=audio/mp4`);
                 } catch (readErr) {
                   console.error(`${FFMPEG_TAG} READ_FAIL  error=${readErr.message}`);
                   finalAudioBuffer = null;
                 }
               }

               let payload;
               if (finalAudioBuffer) {
                 payload = {
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
               } else {
                 console.warn(`${FFMPEG_TAG} Fallback to URL payload due to read/transcode failure.`);
                 payload = {
                   audio: { url: mediaUrl },
                   ptt: true,
                   mimetype: 'audio/mp4'
                 };
               }

               try {
                 sentMsg = await safeSend(jid, payload);
               } finally {
                 if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
                   try { await safeUnlink(transcodeOutputPath); } catch(_) {}
                 }
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

function extractSerializedTag(text, tag) {
  if (typeof text !== 'string') return { cleanText: '', data: null };
  const tagIndex = text.indexOf(tag);
  if (tagIndex === -1) return { cleanText: text, data: null };
  
  const rawPayload = text.substring(tagIndex + tag.length);
  let cleanText = text.substring(0, tagIndex).trim();
  let jsonString = rawPayload;
  
  const nextTagIndex = rawPayload.search(/__[A-Z_]+__/);
  if (nextTagIndex !== -1) {
    jsonString = rawPayload.substring(0, nextTagIndex);
    const remainingTags = rawPayload.substring(nextTagIndex);
    cleanText = cleanText + '\n' + remainingTags;
  }
  
  try {
    const data = JSON.parse(jsonString.trim());
    return { cleanText, data };
  } catch (e) {
    console.error(`Failed to parse tag ${tag}:`, e.message);
    return { cleanText, data: null };
  }
}

async function processIncomingMessage(bot, msg, sock, db) {
  if (!msg.message) return;
  
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter')) return;
  
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
  // Calculate message age — used to skip processing of historical messages replayed by Baileys on restart
  const msgAgeMs = Date.now() - (Number(msg.messageTimestamp) * 1000);
  const isHistoric = msgAgeMs > 10 * 60 * 1000; // 10 minutes threshold (safe against system clock drift)

  let tag = 'General';
  if (!isOutgoing && !isHistoric && text) {
    tag = await analyzeCustomerIntent(text);
  }
  msg.intent_tag = tag;

  // Skip all further processing for historic messages replayed by Baileys on restart
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
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, quote_context, intent, drive_file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)
      `).run(storeId, orderId, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaUrl, mediaType, incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null, tag, driveFileId);
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

  // STT and Receipt OCR payment scanners have been disabled per user request

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
    // Check if this outgoing echo was sent by the bot itself (not a human)
    const isBotEcho = bot._botSentIds && bot._botSentIds.has(msg.key.id);
    if (isBotEcho) {
      bot._botSentIds.delete(msg.key.id);
    }
    // Completely disable human manual handoff lockout. Outgoing messages sent by humans 
    // from the WhatsApp client are ignored for lockout purposes.
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

  // COD Pending Verification Interceptor has been disabled per user request (Auto-Verify disabled)

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



    // WISMO fast interceptor has been disabled; tracking queries will be handled smartly by Gemini

    const settings = db.prepare('SELECT * FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get() || {};
    const { generateAIResponse } = require('./gemini_engine');
    const geminiReply = await generateAIResponse(fromPhone, text);
    if (geminiReply) {
      let textReply = geminiReply;
      let catalogData = null;
      let recommendationData = null;

      if (typeof textReply === 'string') {
        const catExtract = extractSerializedTag(textReply, '__CATALOG_JSON__');
        textReply = catExtract.cleanText;
        catalogData = catExtract.data;

        const recExtract = extractSerializedTag(textReply, '__RECOMMENDATION_JSON__');
        textReply = recExtract.cleanText;
        recommendationData = recExtract.data;
      }

      const handoffKeywords = ['human agent', 'human support', 'live agent', 'connect you to', 'escalat', 'transfer you'];
      const needsHandoff = handoffKeywords.some(kw => textReply.toLowerCase().includes(kw));
      if (needsHandoff) {
        bot.setHumanHandoff(fromPhone, true);
        try {
          const { broadcast } = require('../websocket');
          broadcast('human_handoff_required', { phone: fromPhone, reason: 'Gemini AI flagged handoff', preview: textReply.substring(0, 120) });
        } catch (_) {}
      }
      if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 5) {
        console.warn(`⚠️ [RATE-LIMIT] Skipping Gemini reply to ${fromPhone} — 5 consecutive bot replies without response.`);
      } else {
        // Send the natural language chat reply
        bot.sendMessage(fromPhone, textReply, false);
        bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;

        // If a structured catalog was fetched, send media cards in album format grouped by product
        if (catalogData && catalogData.products && catalogData.products.length > 0) {
          try {
            if (settings.feature_media_cards !== 0) {
              // Group products by base title
              const grouped = {};
              for (const p of catalogData.products) {
                let title = p.title || '';
                
                // Extract variant parts
                let variantPart = '';
                const parenMatch = title.match(/\(([^)]+)\)/);
                if (parenMatch) {
                  variantPart = parenMatch[1];
                } else {
                  const hyphenIndex = title.indexOf(' - ');
                  if (hyphenIndex !== -1) {
                    variantPart = title.substring(hyphenIndex + 3).trim();
                  }
                }
                
                // Base title (e.g. Classic Oxford Shirt)
                let baseTitle = title.replace(/\([^)]*\)/g, '').split(' - ')[0].trim();
                const groupKey = baseTitle.toLowerCase();
                
                if (!grouped[groupKey]) {
                  grouped[groupKey] = {
                    baseTitle: baseTitle,
                    variants: [],
                    price: p.price,
                    colors: new Set()
                  };
                }
                grouped[groupKey].variants.push(p);
                
                // Extract color name
                let color = '';
                if (variantPart) {
                  const parts = variantPart.split(/[\/,]/);
                  for (const part of parts) {
                    const cleanedPart = part.trim();
                    const isSize = /^(m|l|xl|2xl|3xl|4xl|5xl|6xl|s|xs|xxl|xxxl|medium|large|small|double\s*xl|triple\s*xl)$/i.test(cleanedPart);
                    if (!isSize && cleanedPart) {
                      color = cleanedPart;
                      break;
                    }
                  }
                }
                if (color) {
                  grouped[groupKey].colors.add(color);
                }
              }

              // Loop through groups and send album pictures back-to-back, followed by text tags
              let totalImagesQueued = 0;
              const maxTotalImages = 15; // Cap to prevent queue floods

              for (const g of Object.values(grouped)) {
                if (totalImagesQueued >= maxTotalImages) break;
                
                const variantsWithImages = g.variants.filter(v => v.image_url);
                if (variantsWithImages.length === 0) continue;
                
                // Send all color variant images first (without captions to trigger WhatsApp native album)
                for (const v of variantsWithImages) {
                  if (totalImagesQueued >= maxTotalImages) break;
                  bot.sendMessage(fromPhone, "", false, v.image_url, 'image', null, null, null, null, 'native', null, { fastSend: true }).catch(err => {
                    console.error('Failed to send catalog album image:', err.message);
                  });
                  totalImagesQueued++;
                }

                // Immediately send a text card acting as the divider label / price tag for this album
                let labelMsg = `*${g.baseTitle}*\nPrice: Rs. ${g.price}`;
                if (g.colors.size > 0) {
                  labelMsg += `\nAvailable Colors: ${Array.from(g.colors).join(', ')}`;
                }
                bot.sendMessage(fromPhone, labelMsg, false).catch(err => {
                  console.error('Failed to send catalog product text tag:', err.message);
                });
              }

              // If there are overall more than 5 products, follow up with a text link to the full collection
              if (catalogData.products.length > 5) {
                const uniqueUrls = Array.from(new Set(catalogData.products.map(p => p.product_url).filter(Boolean)));
                if (uniqueUrls.length > 0) {
                  const linksText = uniqueUrls.map(url => `🔗 ${url}`).join('\n');
                  const followUpMsg = `Aap is link par visit kar ke baqi tamam colors aur available collection dekh sakte hain:\n\n${linksText}`;
                  bot.sendMessage(fromPhone, followUpMsg, false).catch(err => {
                    console.error('Failed to send catalog follow up links:', err.message);
                  });
                }
              }
            }
          } catch (catalogErr) {
            console.error('❌ Failed to process catalog data:', catalogErr.message);
          }
        }

        // If a structured recommendation was fetched, send interactive button card and product image
        if (recommendationData && recommendationData.recommendation) {
          try {
            const rec = recommendationData.recommendation;

            // Dispatch upsell product image in background
            if (rec.image_url && settings.feature_media_cards !== 0) {
              bot.sendMessage(fromPhone, `*${rec.title}*\nPrice: Rs. ${rec.price}\nSKU: ${rec.sku}`, false, rec.image_url, 'image').catch(err => {
                console.error('Failed to send recommended product image message:', err.message);
              });
            }

            // Dispatch interactive button card (Yes/No)
            if (settings.feature_quick_replies !== 0) {
              const buttonText = `Would you like to add *${rec.title}* (Rs. ${rec.price}) in size ${recommendationData.size} to your order?`;
              const buttons = [
                { label: "Yes, add it! ✅", value: `Yes, add ${rec.title} (SKU: ${rec.sku}) to my order` },
                { label: "No, thanks ❌", value: "No thanks, proceed with my current selection" }
              ];
              await bot.sendMessage(fromPhone, buttonText, false, null, null, null, null, null, buttons, 'native');
            } else {
              const textMessage = `Would you like to add *${rec.title}* (Rs. ${rec.price}) in size ${recommendationData.size} to your order? Reply with "Yes, add ${rec.title} (SKU: ${rec.sku}) to my order" to add it.`;
              await bot.sendMessage(fromPhone, textMessage, false);
            }

          } catch (recErr) {
            console.error('⚠️ Failed to dispatch recommendation interactive messages:', recErr.message);
          }
        }
      }
      return;
    }

    // Fallback template auto-responders have been completely removed per user request
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
  processIncomingMessage,
  adaptiveStrategy
};
