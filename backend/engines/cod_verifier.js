/**
 * 🔐 TRACE ERP: Dynamic COD Verification Engine
 * Generates personalized ElevenLabs TTS audio, transcodes to Apple-safe .mp4,
 * and dispatches via bot queue. FULLY fire-and-forget — never blocks the main process.
 * 
 * Antigravity Rule D: Called ONLY via setImmediate() from route handlers.
 * Antigravity Rule G: Audio buffers written to disk immediately, never held in memory.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { db } = require('../db');
const bot = require('./whatsapp_bot');
const { normalizePhone } = require('./whatsapp_message_processor');

const COD_VN_DIR = process.env.COD_VN_DIR || path.join(process.cwd(), 'data', 'cod_vn');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchElevenLabsAudio(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error('ElevenLabs API key or Voice ID not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs API error: ${res.status} — ${errText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function transcodeToMp4(inputBuffer, outputPath) {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    ensureDir(path.dirname(outputPath));

    const ff = spawn('ffmpeg', [
      '-y', '-i', 'pipe:0',
      '-c:a', 'aac', '-ar', '48000', '-ac', '1',
      outputPath,
    ]);

    ff.stdin.write(inputBuffer);
    ff.stdin.end();

    const safeResolve = (code) => {
      if (!isResolved) {
        isResolved = true;
        if (code === 0 || fs.existsSync(outputPath)) resolve(outputPath);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      }
    };

    const watchdog = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try { ff.kill('SIGKILL'); } catch(_){}
        resolve(outputPath); // Optimistic — file may still be usable
      }
    }, 10000);

    ff.on('exit', (code) => { clearTimeout(watchdog); safeResolve(code); });
    ff.on('close', (code) => { clearTimeout(watchdog); safeResolve(code); });
    ff.on('error', (err) => { clearTimeout(watchdog); if (!isResolved) { isResolved = true; reject(err); } });
  });
}

async function dispatchCODVerification(order) {
  const { id: orderId, phone, customer_name, ref_number } = order;
  const normalizedPhone = normalizePhone(phone);
  const name = (customer_name || 'Customer').split(' ')[0];
  const ref = ref_number || `#${orderId}`;

  let amount = order.price;
  if (amount === undefined || amount === null) {
    try {
      const orderRow = db.prepare('SELECT price FROM orders WHERE id = ?').get(orderId);
      amount = orderRow ? orderRow.price : 'N/A';
    } catch (dbErr) {
      console.error('🔐 COD Verifier: Failed to query price for order:', dbErr.message);
      amount = 'N/A';
    }
  }

  let templateText = '👋 Hello from Trace ERP!\nWe have received your COD order #{ref} for Rs. {amount}.\n\nPlease reply with:\n1 - ✅ Confirm Order\n2 - ❌ Cancel Order\n3 - ✏️ Edit Address/Size';
  let pollOptions = ["✅ Confirm Order", "✏️ Edit Size / Address", "❌ Cancel Order"];

  // Resolve store name for {store_name} variable
  let storeName = 'TracePK';
  try {
    const storeRow = db.prepare('SELECT s.store_name FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(orderId);
    if (storeRow && storeRow.store_name) {
      storeName = storeRow.store_name;
    }
  } catch (storeErr) {
    console.error('🔐 COD Verifier: Failed to query store name:', storeErr.message);
  }

  try {
    const settings = db.prepare('SELECT cod_template, poll_options FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    if (settings) {
      if (settings.cod_template) {
        templateText = settings.cod_template;
      }
      if (settings.poll_options) {
        try {
          const parsed = JSON.parse(settings.poll_options);
          if (Array.isArray(parsed) && parsed.length > 0) {
            pollOptions = parsed;
          }
        } catch (jsonErr) {
          console.error('🔐 COD Verifier: Failed to parse poll_options JSON:', jsonErr.message);
        }
      }
    }
  } catch (dbErr) {
    console.error('🔐 COD Verifier: Failed to fetch whatsapp settings:', dbErr.message);
  }

  const finalMessage = templateText
    .replace(/\{ref\}/gi, ref)
    .replace(/\{amount\}/gi, amount)
    .replace(/\{name\}/gi, name)
    .replace(/\{first_name\}/gi, name)
    .replace(/\{store_name\}/gi, storeName);

  console.log(`🔐 COD Verifier: Starting VN generation for order ${ref} → ${normalizedPhone} (raw: ${phone})`);

  try {
    const script = `Assalam o Alaikum ${name} Sahab! Ye TRACE ERP ki taraf se call hai. Aapka Cash on Delivery order ${ref} confirm karne ke liye 1 reply karein ya cancel karne ke liye 2 reply karein. Shukriya!`;

    // Step 1: Fetch TTS from ElevenLabs (or fallback to text if not configured)
    let mp4Path = null;
    try {
      const audioBuffer = await fetchElevenLabsAudio(script);
      const filename = `cod_${orderId}_${Date.now()}.mp4`;
      mp4Path = path.join(COD_VN_DIR, filename);
      await transcodeToMp4(audioBuffer, mp4Path);
      console.log(`🔐 COD Verifier: MP4 ready at ${mp4Path}`);
    } catch (ttsErr) {
      console.error('🔐 COD Verifier: ElevenLabs/FFmpeg failed, falling back to text:', ttsErr.message);
    }

    // Step 2: Register pending state in DB (24h expiry)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiresStr = expiresAt.toISOString().replace('T', ' ').substring(0, 19);
    db.prepare(`
      INSERT INTO cod_pending_verifications (order_id, phone, status, vn_path, expires_at)
      VALUES (?, ?, 'pending', ?, ?)
    `).run(orderId, normalizedPhone, mp4Path || null, expiresStr);

    // Step 3: Send voice note (if generated) then text instruction
    if (mp4Path && fs.existsSync(mp4Path)) {
      // Force-send the audio
      try {
        await bot.directSendMessage(normalizedPhone, '🎙️ COD Verification Voice Note', true, mp4Path, 'audio', `COD_Verify_${ref}.mp4`, null, null, null, 'native', null, { force: true });
        console.log('✅ COD VERIFIER: Audio force-sent successfully to:', normalizedPhone);
      } catch (err) {
        console.error('❌ COD VERIFIER: Critical audio send failure:', err);
      }
      try {
        const relativeUrl = mp4Path ? `/uploads/cod_vn/${path.basename(mp4Path)}` : null;
        db.prepare(`
          INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status, tenant_id)
          VALUES ((SELECT store_id FROM orders WHERE id = ? LIMIT 1), ?, ?, 'outgoing', '[Voice Note]', ?, 'audio', 'sent', 'default')
        `).run(orderId, orderId, normalizedPhone, relativeUrl);
      } catch(e) { console.error('Failed to log COD VN message:', e.message); }
    }

    // Hard-Fix Poll Payload Structure
    const pollData = {
      name: finalMessage,
      values: pollOptions,
      selectableCount: 1
    };
    // Force-send the poll/message
    try {
      await bot.directSendMessage(normalizedPhone, null, true, null, null, null, null, null, null, 'native', pollData, { force: true });
      console.log('✅ COD VERIFIER: Force-sent successfully to:', normalizedPhone);
    } catch (err) {
      console.error('❌ COD VERIFIER: Critical send failure:', err);
    }
    try {
      db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
        VALUES ((SELECT store_id FROM orders WHERE id = ? LIMIT 1), ?, ?, 'outgoing', ?, 'sent', 'default')
      `).run(orderId, orderId, normalizedPhone, pollData.name);
    } catch(e) { console.error('Failed to log COD Poll message:', e.message); }

    console.log(`🔐 COD Verifier: Verification dispatched for order ${ref}`);
  } catch (err) {
    console.error(`🔐 COD Verifier error for order ${orderId}:`, err.message);
    try {
      const { logSystemError } = require('../db');
      logSystemError('ERROR', `[COD Verifier] Error for order ${orderId}: ${err.message}`, 'cod_verifier');
    } catch (_) {}
  }
}

async function checkAndSendCODFollowUps(customDb, customBot) {
  const activeDb = customDb || db;
  const activeBot = customBot || bot;

  console.log('🕵️‍♂️ [COD_FOLLOWUP] Scanning for pending verifications older than 24 hours...');

  // ── Master Toggle Check ─────────────────────────────────────────────────────
  // If 'Enable 24-Hour COD Follow-up Reminders' is disabled in Master Settings,
  // skip all reminders immediately to honour the admin's explicit choice.
  try {
    const masterSettings = activeDb.prepare(
      'SELECT enable_cod_reminders FROM whatsapp_settings ORDER BY id DESC LIMIT 1'
    ).get();
    if (masterSettings && masterSettings.enable_cod_reminders === 0) {
      console.log('[Reminders] 🛑 Skipped: COD Reminders are disabled in Master Settings.');
      return;
    }
  } catch (settingsErr) {
    // Non-fatal: if the column doesn't exist yet (e.g. fresh container), proceed normally
    console.warn('[COD_FOLLOWUP] Could not read enable_cod_reminders setting, proceeding:', settingsErr.message);
  }

  try {
    const pendingVerifications = activeDb.prepare(`
      SELECT * FROM cod_pending_verifications
      WHERE status = 'pending'
        AND (followup_sent = 0 OR followup_sent IS NULL)
        AND sent_at < datetime('now', '+5 hours', '-24 hours')
    `).all();

    console.log(`🕵️‍♂️ [COD_FOLLOWUP] Found ${pendingVerifications.length} verifications eligible for follow-up.`);

    for (const verification of pendingVerifications) {
      const { id, order_id, phone } = verification;
      const normalizedPhone = normalizePhone(phone);

      let orderRow;
      try {
        orderRow = activeDb.prepare('SELECT id, price, ref_number, store_id, customer_name FROM orders WHERE id = ?').get(order_id);
      } catch (orderErr) {
        console.error(`❌ [COD_FOLLOWUP] Failed to query order for ID ${order_id}:`, orderErr.message);
        continue;
      }

      if (!orderRow) {
        console.warn(`⚠️ [COD_FOLLOWUP] Order ID ${order_id} not found in DB for verification ID ${id}. Skipping.`);
        continue;
      }

      const ref = orderRow.ref_number || `#${orderRow.id}`;
      const amount = orderRow.price !== undefined && orderRow.price !== null ? orderRow.price : 'N/A';
      const name = (orderRow.customer_name || 'Customer').split(' ')[0];

      let storeName = 'TracePK';
      try {
        const storeRow = activeDb.prepare('SELECT store_name FROM stores WHERE id = ?').get(orderRow.store_id);
        if (storeRow && storeRow.store_name) {
          storeName = storeRow.store_name;
        }
      } catch (_) {}

      let templateText = '👋 Quick reminder! We are waiting for your confirmation for order {ref} of Rs. {amount}. Please reply with:\n*1* - ✅ Confirm Order\n*2* - ❌ Cancel Order\n*3* - ✏️ Edit Address/Size';
      try {
        const settings = activeDb.prepare('SELECT cod_followup_template FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
        if (settings && settings.cod_followup_template) {
          templateText = settings.cod_followup_template;
        }
      } catch (dbErr) {
        console.error('❌ [COD_FOLLOWUP] Failed to fetch follow-up template setting:', dbErr.message);
      }

      const finalMessage = templateText
        .replace(/\{ref\}/gi, ref)
        .replace(/\{amount\}/gi, amount)
        .replace(/\{name\}/gi, name)
        .replace(/\{first_name\}/gi, name)
        .replace(/\{store_name\}/gi, storeName);

      console.log(`🚀 [COD_FOLLOWUP] Sending reminder to ${normalizedPhone} for order ${ref}...`);

      try {
        await activeBot.directSendMessage(normalizedPhone, finalMessage, true, null, null, null, null, null, null, 'native', null, { force: true });
        console.log(`✅ [COD_FOLLOWUP] Follow-up sent to ${normalizedPhone}`);

        try {
          activeDb.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
            VALUES (?, ?, ?, 'outgoing', ?, 'sent', 'default')
          `).run(orderRow.store_id, order_id, normalizedPhone, finalMessage);
        } catch(e) { 
          console.error('❌ [COD_FOLLOWUP] Failed to log follow-up message to DB:', e.message); 
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const expiresStr = expiresAt.toISOString().replace('T', ' ').substring(0, 19);

        activeDb.prepare(`
          UPDATE cod_pending_verifications
          SET followup_sent = 1, expires_at = ?
          WHERE id = ?
        `).run(expiresStr, id);

      } catch (sendErr) {
        console.error(`❌ [COD_FOLLOWUP] Failed to send reminder to ${normalizedPhone}:`, sendErr.message);
        try {
          const { logSystemError } = require('../db');
          logSystemError('ERROR', `[COD Followup] Failed to send reminder to +${normalizedPhone}: ${sendErr.message}`, 'cod_verifier');
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('❌ [COD_FOLLOWUP] Critical error in follow-up processor:', err.message);
    try {
      const { logSystemError } = require('../db');
      logSystemError('ERROR', `[COD Followup] Critical error: ${err.message}`, 'cod_verifier');
    } catch (_) {}
  }
}

module.exports = { dispatchCODVerification, checkAndSendCODFollowUps };

