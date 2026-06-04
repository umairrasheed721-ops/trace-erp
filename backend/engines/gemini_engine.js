const { db } = require('../db');
const { geminiTools } = require('./gemini/toolDefinitions');
const { executeToolCall, broadcastMemoryUpdate } = require('./gemini/functionDispatcher');

function logGeminiUsage({ phone = null, status = 'success', model = 'gemini-2.5-flash', toolCalled = null, errorMsg = null, responseMs = 0 }) {
  try {
    db.prepare(`INSERT INTO gemini_usage_logs (phone, status, model, tool_called, error_msg, response_ms) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(phone, status, model, toolCalled, errorMsg, responseMs);
  } catch(e) { /* silent */ }
}

function resolveModelName(modelName) {
  const map = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-pro'
  };
  return map[modelName] || modelName || 'gemini-2.5-flash';
}

async function fetchWithRetry(url, options, maxRetries = 3, initialDelayMs = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout per request
    
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.status === 429) {
        attempt++;
        if (attempt >= maxRetries) {
          return res;
        }

        let delay = initialDelayMs * Math.pow(2, attempt - 1);

        try {
          const cloneRes = res.clone();
          const body = await cloneRes.json();
          const errMsg = body?.error?.message || '';
          const secondsMatch = errMsg.match(/(?:retry|try again) in ([\d\.]+)\s*s/i) || errMsg.match(/([\d\.]+)\s*(?:seconds|sec|s\b)/i);
          if (secondsMatch) {
            const parsedSec = parseFloat(secondsMatch[1]);
            if (!isNaN(parsedSec) && parsedSec > 0) {
              delay = Math.ceil(parsedSec + 1) * 1000;
            }
          }
        } catch (e) {
          // ignore cloning/parsing error
        }

        console.warn(`⚠️ Gemini API 429 (Rate Limit). Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.warn(`⚠️ Fetch error: ${err.message}. Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ─── 📏 SMART SIZING EXTRACTOR ───────────────────────────────────────────────
const SIZE_MAP = [
  { keys: ['6xl', '6 xl', '6 size', 'six xl', '6'], value: '6XL', bigAndTall: true },
  { keys: ['5xl', '5 xl', '5 size', 'five xl', '5'], value: '5XL', bigAndTall: false },
  { keys: ['4xl', '4 xl', '4 size', 'four xl', '4'], value: '4XL', bigAndTall: false },
  { keys: ['3xl', '3 xl', '3 size', 'triple xl', '3'], value: '3XL', bigAndTall: false },
  { keys: ['2xl', '2 xl', '2 size', 'double xl', '2'], value: '2XL', bigAndTall: false },
];
const SIZE_CONTEXT_WORDS = ['size', 'siz', 'xl', 'fitting', 'fit', 'length', 'shirt', 'pant', 'trouser', 'kapra', 'kapray', 'suit', 'bada', 'bade', 'mota', 'heavy', 'plus size', 'big'];

function extractSizeFromMessage(phone, text) {
  if (!text || !phone) return;
  try {
    const lower = text.toLowerCase().trim();
    const hasContext = SIZE_CONTEXT_WORDS.some(w => lower.includes(w));
    if (!hasContext) return;

    let matched = null;
    for (const entry of SIZE_MAP) {
      if (entry.keys.some(k => {
        const re = new RegExp(`(?:^|\\s|[^a-z0-9])${k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:$|\\s|[^a-z0-9])`, 'i');
        return re.test(lower);
      })) {
        matched = entry;
        break;
      }
    }

    if (!matched) return;

    db.prepare(`
      INSERT INTO customer_profiles (phone, size_preference, is_big_and_tall, size_extracted_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
      ON CONFLICT(phone) DO UPDATE SET
        size_preference = excluded.size_preference,
        is_big_and_tall = excluded.is_big_and_tall,
        size_extracted_at = excluded.size_extracted_at,
        updated_at = excluded.updated_at
    `).run(phone, matched.value, matched.bigAndTall ? 1 : 0);

    console.log(`📏 Size extracted for ${phone}: ${matched.value} (Big & Tall: ${matched.bigAndTall})`);
    broadcastMemoryUpdate(phone);
  } catch (err) {
    console.error('📏 Size extractor error:', err.message);
  }
}

// ─── 🎯 AD ATTRIBUTION CHECKER ──────────────────────────────────────────────
function checkAdAttribution(phone, text) {
  if (!phone || !text) return;
  try {
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM whatsapp_messages WHERE phone = ?').get(phone);
    if (msgCount && msgCount.c > 1) return;

    const campaigns = db.prepare('SELECT id, name, platform, pattern FROM ad_campaigns WHERE active = 1').all();
    if (!campaigns || campaigns.length === 0) return;

    const lower = text.toLowerCase();
    for (const campaign of campaigns) {
      try {
        const regex = new RegExp(campaign.pattern, 'i');
        if (regex.test(lower)) {
          db.prepare(`
            INSERT INTO customer_profiles (phone, ad_source, ad_platform, ad_attributed_at, updated_at)
            VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
            ON CONFLICT(phone) DO UPDATE SET
              ad_source = excluded.ad_source,
              ad_platform = excluded.ad_platform,
              ad_attributed_at = excluded.ad_attributed_at,
              updated_at = excluded.updated_at
          `).run(phone, campaign.name, campaign.platform);
          console.log(`🎯 Ad attribution: ${phone} → ${campaign.platform}/${campaign.name}`);
          return;
        }
      } catch(_){}
    }
  } catch (err) {
    console.error('🎯 Ad attribution error:', err.message);
  }
}

async function generateAIResponse(phone, userMessage) {
  let cleanedPhone = (phone || '').replace(/\D/g, '');
  try {
    const settings = db.prepare('SELECT * FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.ai_active === 0 || !settings.api_key) {
      return null;
    }

    let profile = db.prepare('SELECT customer_name, preferences, vip_status FROM customer_profiles WHERE phone = ?').get(cleanedPhone) || { customer_name: 'Customer', preferences: '{}', vip_status: 0 };
    const kbRows = db.prepare('SELECT category, title, content FROM gemini_knowledge_base').all() || [];
    let kbText = kbRows.map(k => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`).join('\n');

    const fullSystemPrompt = `
${settings.system_prompt}

--- COMPANY KNOWLEDGE BASE & POLICIES ---
${kbText}

--- CURRENT CUSTOMER CONTEXT ---
Phone: +${cleanedPhone}
Name: ${profile.customer_name || 'Unknown'}
VIP Status: ${profile.vip_status === 1 ? 'YES (High Value Buyer)' : 'Standard'}
Saved Preferences: ${profile.preferences}

--- INSTRUCTIONS ---
You are chatting with this customer on WhatsApp. Keep your responses concise, friendly, and formatted for WhatsApp (use emojis, bold text *like this*). If they ask about order status, stock, sizing recommendations, or what products are available in their size, use your available tools first (like checkProductStock, getOrderStatus, or fetchCatalog) before replying. When they express interest in buying a product or are ready to purchase, call the getMatchingRecommendations tool to find a matching product in their size (e.g. pants if they buy a shirt) and suggest/cross-sell it to them.
`;

    const memoryRows = db.prepare(`
      SELECT role, content FROM (
        SELECT id, role, content FROM gemini_chat_memory 
        WHERE phone = ? 
        ORDER BY id DESC LIMIT 6
      ) ORDER BY id ASC
    `).all(cleanedPhone) || [];
    
    let contents = memoryRows.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const apiKey = settings.api_key;
    const model = resolveModelName(settings.model_name);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const enabledDeclarations = [];
    const fullToolsList = geminiTools[0]?.functionDeclarations || [];
    
    fullToolsList.forEach(decl => {
      let isEnabled = true;
      if (decl.name === 'checkProductStock' && settings.tool_check_stock === 0) isEnabled = false;
      if (decl.name === 'getOrderStatus' && settings.tool_order_status === 0) isEnabled = false;
      if (decl.name === 'createDraftOrder' && settings.tool_create_order === 0) isEnabled = false;
      if (decl.name === 'updateCustomerProfile' && settings.tool_update_profile === 0) isEnabled = false;
      if (decl.name === 'fetchCatalog' && settings.tool_fetch_catalog === 0) isEnabled = false;
      if (decl.name === 'getMatchingRecommendations' && settings.tool_recommendations === 0) isEnabled = false;
      
      if (isEnabled) {
        enabledDeclarations.push(decl);
      }
    });

    const activeTools = enabledDeclarations.length > 0 ? [{ functionDeclarations: enabledDeclarations }] : undefined;

    let payload = {
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      tools: activeTools
    };

    const _startMs = Date.now();
    console.log(`🚀 Sending prompt to Gemini (${model})...`);
    let res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
      console.error('❌ Gemini API Error:', data);
      return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
    }

    let candidate = data.candidates?.[0];
    if (!candidate) return null;

    let part = candidate.content?.parts?.[0];

    let fetchCatalogResult = null;
    let getMatchingRecommendationsResult = null;
    if (part?.functionCall) {
      const call = part.functionCall;
      const toolResult = await executeToolCall(call.name, call.args);
      if (call.name === 'fetchCatalog' && toolResult && toolResult.success) {
        fetchCatalogResult = toolResult;
      } else if (call.name === 'getMatchingRecommendations' && toolResult && toolResult.success) {
        getMatchingRecommendationsResult = toolResult;
      }

      contents.push({
        role: 'model',
        parts: [{ functionCall: call }]
      });

      contents.push({
        role: 'tool',
        parts: [{
          functionResponse: {
            name: call.name,
            response: { result: toolResult }
          }
        }]
      });

      console.log(`🚀 Sending Tool Response back to Gemini (${model})...`);
      let secondPayload = {
        systemInstruction: { parts: [{ text: fullSystemPrompt }] },
        contents,
        tools: activeTools
      };

      let secondRes = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondPayload)
      });

      let secondData = await secondRes.json();
      if (!secondRes.ok) {
        console.error('❌ Gemini Second API Error:', secondData);
        return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
      }

      candidate = secondData.candidates?.[0];
      part = candidate?.content?.parts?.[0];
    }

    let replyText = part?.text || '';
    if (!replyText) return null;

    if (fetchCatalogResult) {
      replyText += '\n__CATALOG_JSON__' + JSON.stringify(fetchCatalogResult);
    }
    if (getMatchingRecommendationsResult) {
      replyText += '\n__RECOMMENDATION_JSON__' + JSON.stringify(getMatchingRecommendationsResult);
    }

    try {
      const insertMem = db.prepare('INSERT INTO gemini_chat_memory (phone, role, content) VALUES (?, ?, ?)');
      insertMem.run(cleanedPhone, 'user', userMessage);
      insertMem.run(cleanedPhone, 'model', replyText);
    } catch(memErr){}

    console.log(`🤖 Gemini AI Reply to ${cleanedPhone}: ${replyText}`);

    const toolName = part?.functionCall?.name || null;
    logGeminiUsage({ phone: cleanedPhone, status: 'success', model, toolCalled: toolName, responseMs: Date.now() - _startMs });

    setImmediate(() => extractSizeFromMessage(cleanedPhone, userMessage));
    setImmediate(() => checkAdAttribution(cleanedPhone, userMessage));

    return replyText;

  } catch (err) {
    console.error('❌ generateAIResponse error:', err.message);
    try { logGeminiUsage({ phone: cleanedPhone, status: 'error', errorMsg: err.message }); } catch(_){}
    return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
  }
}

async function runNightlyAudit() {
  console.log('🌙 Initiating Gemini Nightly Self-Learning Audit...');
  try {
    const settings = db.prepare('SELECT api_key, auto_learning_enabled, system_prompt FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.auto_learning_enabled === 0 || !settings.api_key) {
      console.log('⚠️ Nightly Audit skipped: Auto-learning disabled or API key missing.');
      return { success: false, message: 'Auto-learning disabled or API key missing.' };
    }

    const msgs = db.prepare(`SELECT phone, direction, message, created_at FROM whatsapp_messages WHERE created_at >= datetime('now', '-24 hours') ORDER BY id ASC`).all() || [];
    if (msgs.length === 0) {
      console.log('⚠️ Nightly Audit skipped: No WhatsApp messages found in the last 24 hours.');
      return { success: false, message: 'No messages to analyze.' };
    }

    let chatLogText = msgs.map(m => `[${m.created_at}] ${m.direction === 'incoming' ? 'Customer (' + m.phone + ')' : 'Bot'}: ${m.message}`).join('\n');
    
    const auditPrompt = `
You are an expert AI Operations Auditor for an e-commerce business.
Analyze the following WhatsApp customer service chat logs from the past 24 hours.

Identify:
1. Customer Friction Points: Where were customers confused? What policies or responses caused frustration?
2. Suggested Prompt Refinements: What specific instructions should we add to the bot's system prompt to handle these scenarios better tomorrow?

Chat Logs:
${chatLogText}

Output your analysis strictly in the following JSON format:
{
  "friction_points": ["point 1", "point 2"],
  "prompt_refinements": ["refinement 1", "refinement 2"],
  "suggested_system_prompt_addition": "Specific rule to append to the system prompt."
}
`;

    const apiKey = settings.api_key;
    const model = resolveModelName('gemini-1.5-pro');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let payload = {
      contents: [{ role: 'user', parts: [{ text: auditPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    let res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
      console.error('❌ Gemini Audit API Error:', data);
      return { success: false, error: 'API Error' };
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed = {};
    try { parsed = JSON.parse(text); } catch(e){}

    const friction = JSON.stringify(parsed.friction_points || []);
    const refinements = JSON.stringify(parsed.prompt_refinements || []);
    const addition = parsed.suggested_system_prompt_addition || '';

    db.prepare(`
      INSERT INTO gemini_audit_logs (audit_date, messages_analyzed, friction_points, prompt_refinements)
      VALUES (date('now'), ?, ?, ?)
    `).run(msgs.length, friction, refinements);

    if (addition && addition.length > 10) {
      const newPrompt = settings.system_prompt + '\n\n[Auto-Learned Rule ' + new Date().toISOString().split('T')[0] + ']: ' + addition;
      db.prepare('UPDATE gemini_bot_settings SET system_prompt = ?, updated_at = datetime("now")').run(newPrompt);
      console.log('✅ Nightly Audit Complete: Auto-enriched master system prompt!');
    }

    return { success: true, frictionPoints: parsed.friction_points, refinements: parsed.prompt_refinements };

  } catch (err) {
    console.error('❌ runNightlyAudit error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateAIResponse,
  runNightlyAudit,
  extractSizeFromMessage,
  checkAdAttribution,
};
