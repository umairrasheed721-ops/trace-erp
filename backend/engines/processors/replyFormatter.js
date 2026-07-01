const FORMAL_COD_TEMPLATE = `Dear [Name],\n\nThis is a formal verification request for your Cash on Delivery order [OrderID] of Rs [Price]. Please confirm your order by replying to this message.\n\nThank you for choosing TRACE.`;
const FORMAL_SHIPPING_TEMPLATE = `Dear [Name],\n\nWe are pleased to inform you that your order [OrderID] has been shipped via [Courier].\n\nTracking Number: [Tracking]\nLive Tracking Link: [Link]\n\nThank you for shopping with us.`;

function normalizePhone(raw) {
  if (!raw) return '';
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  if (n.startsWith('9292') && n.length > 12) {
    n = n.substring(2);
  }
  if (n.startsWith('920') && n.length === 13) {
    n = '92' + n.substring(3);
  }
  if (n.startsWith('0') && n.length === 11) {
    n = '92' + n.substring(1);
  }
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
  
  const APP_URL = process.env.APP_URL || 'https://trace-erp.up.railway.app';
  const slug = orderInfo?.tracking_slug || 'tr_mock_slug';
  const traceLink = `${APP_URL}/track/${slug}`;

  // Direct Courier Tracking URL
  let courierLink = 'N/A';
  if (tracking && tracking !== 'N/A') {
    const courierLower = (courier || '').toLowerCase();
    if (courierLower.includes('postex')) {
      courierLink = `https://postex.pk/tracking?cn=${tracking}`;
    } else {
      courierLink = `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${tracking}`;
    }
  }

  const address = orderInfo?.address || 'N/A';
  const city = orderInfo?.city || 'N/A';
  const phone = orderInfo?.phone || 'N/A';
  const products = orderInfo?.product_titles || 'N/A';
  const refNumber = orderInfo?.ref_number || 'N/A';
  const itemsCount = orderInfo?.items_count || '0';

  return templateStr
    .replace(/\[Name\]/g, name)
    .replace(/\[OrderID\]/g, orderId)
    .replace(/\[Price\]/g, price)
    .replace(/\[Courier\]/g, courier)
    .replace(/\[Tracking\]/g, tracking)
    .replace(/\[Link\]/g, traceLink)
    .replace(/\[TraceLink\]/g, traceLink)
    .replace(/\[CourierLink\]/g, courierLink)
    .replace(/\[Address\]/g, address)
    .replace(/\[City\]/g, city)
    .replace(/\[Phone\]/g, phone)
    .replace(/\[Products\]/g, products)
    .replace(/\[RefNumber\]/g, refNumber)
    .replace(/\[ItemsCount\]/g, itemsCount);
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
      SELECT id, customer_name, price, courier, tracking_number, address, city, phone, product_titles, ref_number, items_count 
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

module.exports = {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  detectOutboundType,
  formatTemplate,
  cleanAndShortenForHuman,
  adaptiveStrategy,
  extractSerializedTag
};
