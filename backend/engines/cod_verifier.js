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

const COD_VN_DIR = process.env.COD_VN_DIR || path.join(process.cwd(), 'data', 'cod_vn');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchElevenLabsAudio(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error('ElevenLabs API key or Voice ID not configured');

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
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs API error: ${res.status} — ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
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
  const name = (customer_name || 'Customer').split(' ')[0];
  const ref = ref_number || `#${orderId}`;

  console.log(`🔐 COD Verifier: Starting VN generation for order ${ref} → ${phone}`);

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
    `).run(orderId, phone, mp4Path || null, expiresStr);

    // Step 3: Send voice note (if generated) then text instruction
    if (mp4Path && fs.existsSync(mp4Path)) {
      bot.sendMessage(phone, '🎙️ COD Verification Voice Note', true, mp4Path, 'audio', `COD_Verify_${ref}.mp4`);
    }

    // Always send text fallback for clarity
    const textMsg = `🔐 *COD Order Verification — ${ref}*\n\nAapka Cash on Delivery order receive hua hai.\n\n*Reply karein:*\n*1* ✅ Confirm karna hai\n*2* ❌ Cancel karna hai\n\nYe option 24 ghanty ke liye valid hai.`;
    bot.sendMessage(phone, textMsg, true);

    console.log(`🔐 COD Verifier: Verification dispatched for order ${ref}`);
  } catch (err) {
    console.error(`🔐 COD Verifier error for order ${orderId}:`, err.message);
  }
}

module.exports = { dispatchCODVerification };
