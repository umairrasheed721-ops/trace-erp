const { db } = require('../db');

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
    const model = settings.model_name || 'gemini-1.5-flash';
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

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
  runNightlyAudit
};
