const { db } = require('../db');

function resolveModelName(modelName) {
  const map = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-pro'
  };
  return map[modelName] || modelName || 'gemini-2.5-flash';
}

/**
 * 🧠 TRACE ERP: Gemini Autonomous AI Orchestration Engine
 * Implements RAG memory, Function Calling (Tool Use), and Nightly Self-Learning Audit.
 */

// Define Available Database Tools for Gemini
const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'getOrderStatus',
        description: 'Get the live tracking number, courier name, delivery status, and verification status for a customer phone number.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'The 10 or 12 digit phone number of the customer.' }
          },
          required: ['phone']
        }
      },
      {
        name: 'checkProductStock',
        description: 'Check live inventory availability, SKU, and unit price for a product title or keyword.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_title: { type: 'STRING', description: 'The title, variant, or keyword of the product.' }
          },
          required: ['product_title']
        }
      },
      {
        name: 'createDraftOrder',
        description: 'Autonomously create a verified Draft order in the ERP when a customer requests to place a new order.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customer_name: { type: 'STRING', description: 'Full name of the customer.' },
            phone: { type: 'STRING', description: 'Customer phone number.' },
            address: { type: 'STRING', description: 'Complete delivery street address.' },
            city: { type: 'STRING', description: 'Delivery city.' },
            product_sku_or_title: { type: 'STRING', description: 'SKU or title of the product they wish to buy.' },
            price: { type: 'NUMBER', description: 'Total agreed price.' }
          },
          required: ['customer_name', 'phone', 'address', 'city', 'product_sku_or_title', 'price']
        }
      },
      {
        name: 'updateCustomerProfile',
        description: 'Save persistent customer preferences, sizing, or delivery instructions into their long-term profile.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Customer phone number.' },
            preference_key: { type: 'STRING', description: 'Key of the preference (e.g., preferred_size, delivery_time, special_notes).' },
            preference_value: { type: 'STRING', description: 'Value of the preference.' }
          },
          required: ['phone', 'preference_key', 'preference_value']
        }
      }
    ]
  }
];

// Helper to execute local DB tools
function executeToolCall(name, args) {
  console.log(`🛠️ Gemini Tool Execution: ${name}`, args);
  try {
    if (name === 'getOrderStatus') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      const order = db.prepare(`SELECT id, shopify_order_id, ref_number, tracking_number, courier, delivery_status, wa_verification_status, price, order_date FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`);
      if (!order) return { success: false, message: `No active order found for phone ${args.phone}` };
      return { success: true, order };
    }

    if (name === 'checkProductStock') {
      const rows = db.prepare(`SELECT shopify_variant_id, parent_title, variant_title, sku, selling_price, inventory_qty FROM product_master_costs WHERE parent_title LIKE ? OR variant_title LIKE ? LIMIT 5`).all(`%${args.product_title}%`, `%${args.product_title}%`);
      if (!rows || rows.length === 0) return { success: false, message: `No matching products found for '${args.product_title}'` };
      return { success: true, products: rows };
    }

    if (name === 'createDraftOrder') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      const fakeShopifyId = 'DRAFT-' + Date.now();
      const fakeRef = 'TR-' + Math.floor(Math.random() * 90000 + 10000);
      
      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, ref_number, customer_name, phone, address, city, price, delivery_status, order_source, product_titles)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'WhatsApp Bot AI', ?)
      `).run(fakeShopifyId, fakeRef, args.customer_name, cleaned, args.address, args.city, Number(args.price), args.product_sku_or_title);
      
      return { success: true, message: `Draft order ${fakeRef} created successfully for ${args.customer_name}.` };
    }

    if (name === 'updateCustomerProfile') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      let profile = db.prepare('SELECT id, preferences FROM customer_profiles WHERE phone = ?').get(cleaned);
      let prefs = {};
      if (profile && profile.preferences) {
        try { prefs = JSON.parse(profile.preferences); } catch(e){}
      }
      prefs[args.preference_key] = args.preference_value;

      db.prepare(`
        INSERT INTO customer_profiles (phone, preferences, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET preferences = excluded.preferences, updated_at = datetime('now')
      `).run(cleaned, JSON.stringify(prefs));

      return { success: true, message: `Profile updated: ${args.preference_key} = ${args.preference_value}` };
    }

    return { success: false, message: `Unknown tool ${name}` };
  } catch (err) {
    console.error(`❌ Tool execution error (${name}):`, err.message);
    return { success: false, error: err.message };
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
// Only trigger on size-relevant context words to avoid false positives on order numbers
const SIZE_CONTEXT_WORDS = ['size', 'siz', 'xl', 'fitting', 'fit', 'length', 'shirt', 'pant', 'trouser', 'kapra', 'kapray', 'suit', 'bada', 'bade', 'mota', 'heavy', 'plus size', 'big'];

function extractSizeFromMessage(phone, text) {
  if (!text || !phone) return;
  try {
    const lower = text.toLowerCase().trim();
    // Must contain a size context word to prevent triggering on random number messages
    const hasContext = SIZE_CONTEXT_WORDS.some(w => lower.includes(w));
    if (!hasContext) return;

    let matched = null;
    for (const entry of SIZE_MAP) {
      if (entry.keys.some(k => {
        // Match whole word or as standalone token
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
  } catch (err) {
    console.error('📏 Size extractor error:', err.message);
  }
}

// ─── 🎯 AD ATTRIBUTION CHECKER ──────────────────────────────────────────────
function checkAdAttribution(phone, text) {
  if (!phone || !text) return;
  try {
    // Only run on first-ever message from this phone
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM whatsapp_messages WHERE phone = ?').get(phone);
    if (msgCount && msgCount.c > 1) return; // Not a first message

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
          return; // First match wins
        }
      } catch(_){} // Ignore regex errors for individual campaigns
    }
  } catch (err) {
    console.error('🎯 Ad attribution error:', err.message);
  }
}

async function generateAIResponse(phone, userMessage) {
  try {
    const settings = db.prepare('SELECT api_key, ai_active, model_name, system_prompt FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.ai_active === 0 || !settings.api_key) {
      return null; // Fallback to standard regex templates
    }

    let cleanedPhone = phone.replace(/\D/g, '');

    // 1. Fetch Customer Profile
    let profile = db.prepare('SELECT customer_name, preferences, vip_status FROM customer_profiles WHERE phone = ?').get(cleanedPhone) || { customer_name: 'Customer', preferences: '{}', vip_status: 0 };
    
    // 2. Fetch RAG Knowledge Base
    const kbRows = db.prepare('SELECT category, title, content FROM gemini_knowledge_base').all() || [];
    let kbText = kbRows.map(k => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`).join('\n');

    // 3. Build Master System Instruction
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
You are chatting with this customer on WhatsApp. Keep your responses concise, friendly, and formatted for WhatsApp (use emojis, bold text *like this*). If they ask about order status, stock, or want to buy something, use your available tools first before replying.
`;

    // 4. Fetch Short-Term Chat Memory
    const memoryRows = db.prepare('SELECT role, content FROM gemini_chat_memory WHERE phone = ? ORDER BY id ASC LIMIT 20').all(cleanedPhone) || [];
    
    // Build Gemini contents array
    let contents = memoryRows.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const apiKey = settings.api_key;
    const model = resolveModelName(settings.model_name);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // --- FIRST GEMINI FETCH (Check for Tool Call) ---
    let payload = {
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      tools: geminiTools
    };

    console.log(`🚀 Sending prompt to Gemini (${model})...`);
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
      console.error('❌ Gemini API Error:', data);
      return null;
    }

    let candidate = data.candidates?.[0];
    if (!candidate) return null;

    let part = candidate.content?.parts?.[0];

    // --- CHECK FOR FUNCTION CALL ---
    if (part?.functionCall) {
      const call = part.functionCall;
      const toolResult = executeToolCall(call.name, call.args);

      // Append model functionCall request to contents
      contents.push({
        role: 'model',
        parts: [{ functionCall: call }]
      });

      // Append tool response to contents
      contents.push({
        role: 'tool',
        parts: [{
          functionResponse: {
            name: call.name,
            response: { result: toolResult }
          }
        }]
      });

      // --- SECOND GEMINI FETCH (Get Final Natural Answer) ---
      console.log(`🚀 Sending Tool Response back to Gemini (${model})...`);
      let secondPayload = {
        systemInstruction: { parts: [{ text: fullSystemPrompt }] },
        contents,
        tools: geminiTools
      };

      let secondRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondPayload)
      });

      let secondData = await secondRes.json();
      if (!secondRes.ok) {
        console.error('❌ Gemini Second API Error:', secondData);
        return null;
      }

      candidate = secondData.candidates?.[0];
      part = candidate?.content?.parts?.[0];
    }

    const replyText = part?.text || '';
    if (!replyText) return null;

    // --- SAVE TO CHAT MEMORY ---
    try {
      const insertMem = db.prepare('INSERT INTO gemini_chat_memory (phone, role, content) VALUES (?, ?, ?)');
      insertMem.run(cleanedPhone, 'user', userMessage);
      insertMem.run(cleanedPhone, 'model', replyText);
    } catch(memErr){}

    console.log(`🤖 Gemini AI Reply to ${cleanedPhone}: ${replyText}`);

    // --- 📏 SIZE EXTRACTOR (Post-AI, fire-and-forget) ---
    setImmediate(() => extractSizeFromMessage(cleanedPhone, userMessage));

    // --- 🎯 AD ATTRIBUTION (First-message check, fire-and-forget) ---
    setImmediate(() => checkAdAttribution(cleanedPhone, userMessage));

    return replyText;

  } catch (err) {
    console.error('❌ generateAIResponse error:', err.message);
    return null;
  }
}

/**
 * 🌙 Nightly Self-Learning Audit Loop
 * Analyzes recent WhatsApp chat logs to discover customer friction points and auto-updates the system prompt.
 */
async function runNightlyAudit() {
  console.log('🌙 Initiating Gemini Nightly Self-Learning Audit...');
  try {
    const settings = db.prepare('SELECT api_key, auto_learning_enabled, system_prompt FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.auto_learning_enabled === 0 || !settings.api_key) {
      console.log('⚠️ Nightly Audit skipped: Auto-learning disabled or API key missing.');
      return { success: false, message: 'Auto-learning disabled or API key missing.' };
    }

    // Fetch last 24 hours of WhatsApp messages
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

    let res = await fetch(url, {
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

    // Save Audit Log
    db.prepare(`
      INSERT INTO gemini_audit_logs (audit_date, messages_analyzed, friction_points, prompt_refinements)
      VALUES (date('now'), ?, ?, ?)
    `).run(msgs.length, friction, refinements);

    // Auto-Enrich System Prompt if addition exists
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
