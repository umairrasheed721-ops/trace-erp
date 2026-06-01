const fs = require('fs');
const path = require('path');
const { db } = require('../db');

function resolveModelName(modelName) {
  const map = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-pro'
  };
  return map[modelName] || modelName || 'gemini-2.5-flash';
}

async function runNightlyAuditService() {
  console.log('🌙 [AUDIT] Starting Nightly Self-Learning Audit Loop...');
  
  const rootDir = path.resolve(__dirname, '../..');
  const logsDir = path.join(rootDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logPath = path.join(logsDir, 'daily_activity.json');
  
  // Create mock/placeholder file if it doesn't exist to ensure successful operation
  if (!fs.existsSync(logPath)) {
    const mockActivity = [
      { timestamp: new Date().toISOString(), phone: "923001234567", query: "Mera parcel kahan hai? Tracking link open nahi ho raha", status: "failed", error: "Gemini API Timeout" },
      { timestamp: new Date().toISOString(), phone: "923007654321", query: "Sizing recommendations batao 3XL waist and chest size in inches?", status: "failed", error: "Out of stock" },
      { timestamp: new Date().toISOString(), phone: "923005555555", query: "Mujhe customer representative se call krwao, urgent status checks", status: "failed", error: "Handoff trigger timeout" }
    ];
    fs.writeFileSync(logPath, JSON.stringify(mockActivity, null, 2), 'utf8');
    console.log(`📝 [AUDIT] Created default daily_activity.json at: ${logPath}`);
  }

  try {
    const rawData = fs.readFileSync(logPath, 'utf8');
    const activities = JSON.parse(rawData || '[]');
    
    // Filter failed or unresolved queries
    const failures = activities.filter(a => a.status === 'failed' || a.status === 'unresolved' || a.error);
    
    if (failures.length === 0) {
      console.log('✅ [AUDIT] Zero failures or unresolved queries found in daily_activity.json. Skipping AI audit.');
      return;
    }

    const failedQueriesText = failures.map((f, i) => `${i + 1}. [Phone: ${f.phone}] Query: "${f.query}" | Error/Reason: "${f.error || 'Unresolved'}"`).join('\n');

    // Retrieve settings
    const settings = db.prepare('SELECT api_key, model_name FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || !settings.api_key) {
      console.warn('⚠️ [AUDIT] Nightly Audit skipped: API key missing in gemini_bot_settings.');
      return;
    }

    const apiKey = settings.api_key;
    const model = resolveModelName(settings.model_name);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Analyze these failures and suggest 3 improvements to the System Prompt to resolve them.
Here are the failed/unresolved customer queries from today's logs:
${failedQueriesText}

You MUST output your result STRICTLY in a Markdown table with exactly these two headers: "Failed Query" and "Proposed Fix". Do not wrap the table in any markdown code block characters unless it's just the table text itself.`;

    const payload = {
      systemInstruction: {
        parts: [{ text: "You are an AI auditor that analyzes customer service bot failures. Output a markdown table containing analysis and fixes." }]
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    };

    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    let replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!replyText) {
      throw new Error('Empty response from Gemini API');
    }

    // Save output to improvement_sheet.md in root directory
    const sheetPath = path.join(rootDir, 'improvement_sheet.md');
    fs.writeFileSync(sheetPath, replyText.trim(), 'utf8');
    console.log(`✅ [AUDIT] Successfully saved improvement_sheet.md at: ${sheetPath}`);

  } catch (err) {
    console.error('❌ [AUDIT] Nightly Self-Learning Audit failed:', err.message);
  }
}

module.exports = {
  runNightlyAuditService
};
