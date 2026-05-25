/**
 * 🎙️ TRACE ERP: Voice Note STT (Speech-to-Text) Engine
 * Transcribes incoming WhatsApp voice notes using Groq Whisper API (primary)
 * or OpenAI Whisper (fallback). FULLY fire-and-forget via setImmediate.
 * 
 * Antigravity Rule F: Failure in transcription MUST NOT crash message insertion.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');

async function transcribeVoiceNote(phone, dbMessageId, localFilePath) {
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    console.warn(`🎙️ STT: File not found: ${localFilePath}`);
    return;
  }

  const provider = process.env.STT_PROVIDER || 'groq';
  const language = process.env.STT_LANGUAGE || 'ur';

  try {
    // Step 1: Convert to 16kHz mono WAV using FFmpeg
    const wavPath = localFilePath.replace(/\.[^.]+$/, '_stt.wav');
    await new Promise((resolve, reject) => {
      let done = false;
      const ff = spawn('ffmpeg', ['-y', '-i', localFilePath, '-ar', '16000', '-ac', '1', '-f', 'wav', wavPath]);
      const finish = () => { if (!done) { done = true; resolve(); } };
      setTimeout(() => { if (!done) { done = true; try { ff.kill('SIGKILL'); } catch(_){} resolve(); } }, 15000);
      ff.on('exit', finish);
      ff.on('close', finish);
      ff.on('error', (e) => { if (!done) { done = true; reject(e); } });
    });

    if (!fs.existsSync(wavPath)) {
      console.warn('🎙️ STT: WAV conversion failed.');
      return;
    }

    // Step 2: Call STT API
    let transcript = null;
    const wavBuffer = fs.readFileSync(wavPath);

    if (provider === 'groq') {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) { console.warn('🎙️ STT: GROQ_API_KEY not set'); return; }

      const { FormData, File } = await import('formdata-node');
      const form = new FormData();
      form.set('file', new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }));
      form.set('model', 'whisper-large-v3');
      form.set('language', language);
      form.set('response_format', 'json');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      });
      const data = await res.json();
      transcript = data?.text || null;

    } else if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) { console.warn('🎙️ STT: OPENAI_API_KEY not set'); return; }

      const { FormData, File } = await import('formdata-node');
      const form = new FormData();
      form.set('file', new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }));
      form.set('model', 'whisper-1');
      form.set('language', language);

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      });
      const data = await res.json();
      transcript = data?.text || null;
    }

    // Cleanup temp WAV
    try { fs.unlinkSync(wavPath); } catch(_){}

    if (!transcript) {
      console.warn('🎙️ STT: Empty transcript received.');
      return;
    }

    console.log(`🎙️ STT Transcript for msg ${dbMessageId}: "${transcript}"`);

    // Step 3: Persist to DB
    db.prepare(`
      UPDATE whatsapp_messages
      SET transcript = ?, transcript_at = datetime('now', '+5 hours')
      WHERE id = ?
    `).run(transcript, dbMessageId);

    // Step 4: Broadcast via WebSocket so portal re-renders instantly
    try {
      const { broadcast } = require('../websocket');
      broadcast('transcript', { phone, messageId: dbMessageId, transcript });
    } catch(_){}

  } catch (err) {
    console.error('🎙️ STT engine error:', err.message);
    // Fail silently — Rule F
  }
}

module.exports = { transcribeVoiceNote };
