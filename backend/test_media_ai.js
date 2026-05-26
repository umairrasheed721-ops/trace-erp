const fs = require('fs');
const cp = require('child_process');
const { db } = require('./db');

// --- 🛡️ MOCK FILESYSTEM AND SPAWN FOR OFFLINE ROBUSTNESS ---
const originalExists = fs.existsSync;
fs.existsSync = (p) => {
  if (p.includes('dummy_audio') || p.includes('dummy_receipt') || p.includes('_stt.wav')) return true;
  return originalExists(p);
};

const originalRead = fs.readFileSync;
fs.readFileSync = (p, opt) => {
  if (p.includes('dummy_audio') || p.includes('dummy_receipt') || p.includes('_stt.wav')) {
    return Buffer.from('mock file data');
  }
  return originalRead(p, opt);
};

cp.spawn = (cmd, args) => {
  const wavPath = args[args.length - 1];
  try {
    fs.writeFileSync(wavPath, 'mock pcm wav data');
  } catch (_) {}
  
  const EventEmitter = require('events');
  const emitter = new EventEmitter();
  emitter.kill = () => {};
  setTimeout(() => {
    emitter.emit('exit', 0);
    emitter.emit('close', 0);
  }, 10);
  return emitter;
};

// --- 🛡️ MOCK GLOBAL FETCH FOR GROQ/OPENAI ---
global.fetch = async (url, options) => {
  if (url.includes('transcriptions')) {
    return {
      ok: true,
      json: async () => ({ text: 'Bhai mera parcel kahan hai' })
    };
  }
  if (url.includes('chat/completions')) {
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              is_payment_receipt: true,
              payment_type: 'IBFT',
              amount: 5000,
              txn_id: '12345678',
              bank_name: 'HBL',
              sender_name: 'Test Customer',
              confidence: 0.95
            })
          }
        }]
      })
    };
  }
  return { ok: false };
};

// Mock env keys so checks pass
process.env.GROQ_API_KEY = 'mock_groq_key';
process.env.OPENAI_API_KEY = 'mock_openai_key';
process.env.STT_PROVIDER = 'groq';
process.env.OCR_PROVIDER = 'openai';

const { transcribeVoiceNote } = require('./engines/stt_engine');
const { scanReceiptOCR } = require('./engines/ocr_engine');

async function runTest() {
  console.log('🧪 Starting AI & Media Pipeline Dry Run Test...');

  // Setup mock order and store in database
  db.exec(`
    INSERT OR REPLACE INTO stores (id, shop_domain, access_token)
    VALUES (1, 'test-store.myshopify.com', 'token123');
    
    INSERT OR REPLACE INTO orders (id, store_id, shopify_order_id, ref_number, phone, total_price, payment_status)
    VALUES (9999, 1, 'order-9999', 'TR-9999', '923134725415', 5000, 'Pending');
  `);

  // 1. TEST VOICE NOTE STT PIPELINE
  console.log('\n--- 1. Testing Voice Note STT Pipeline ---');
  // Insert dummy audio message
  const audioInsert = db.prepare(`
    INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status)
    VALUES (1, 9999, '923134725415', 'incoming', '[AUDIO]', '/uploads/dummy_audio.ogg', 'audio', 'sent')
  `).run();
  const audioMsgId = audioInsert.lastInsertRowid;

  console.log(`Inserted dummy audio message (ID: ${audioMsgId})`);
  await transcribeVoiceNote('923134725415', audioMsgId, '/uploads/dummy_audio.ogg');

  // Verify DB updates
  const updatedAudio = db.prepare('SELECT transcript, status, ai_processed FROM whatsapp_messages WHERE id = ?').get(audioMsgId);
  console.log('Updated Audio Message in DB:', updatedAudio);
  if (updatedAudio.status === 'AI_PROCESSED' && updatedAudio.ai_processed === 'AI_PROCESSED' && updatedAudio.transcript === 'Bhai mera parcel kahan hai') {
    console.log('✅ STT DB verification passed!');
  } else {
    throw new Error('❌ STT DB verification failed!');
  }

  // 2. TEST RECEIPT OCR PIPELINE
  console.log('\n--- 2. Testing Receipt OCR Pipeline ---');
  // Insert dummy image message
  const imageInsert = db.prepare(`
    INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status)
    VALUES (1, 9999, '923134725415', 'incoming', '[IMAGE]', '/uploads/dummy_receipt.png', 'image', 'sent')
  `).run();
  const imageMsgId = imageInsert.lastInsertRowid;

  console.log(`Inserted dummy image message (ID: ${imageMsgId})`);
  await scanReceiptOCR('923134725415', 9999, imageMsgId, '/uploads/dummy_receipt.png');

  // Verify DB updates for image message
  const updatedImage = db.prepare('SELECT transcript, status, ai_processed FROM whatsapp_messages WHERE id = ?').get(imageMsgId);
  console.log('Updated Image Message in DB:', updatedImage);
  if (updatedImage.status === 'AI_PROCESSED' && updatedImage.ai_processed === 'AI_PROCESSED' && updatedImage.transcript.includes('Rs. 5000 Matched')) {
    console.log('✅ OCR message update verification passed!');
  } else {
    throw new Error('❌ OCR message update verification failed!');
  }

  // Verify DB updates for order payment status (due to tolerance matching)
  const updatedOrder = db.prepare('SELECT payment_status, paid_amount FROM orders WHERE id = 9999').get();
  console.log('Updated Order in DB:', updatedOrder);
  if (updatedOrder.payment_status === 'OCR Verified' && updatedOrder.paid_amount === 5000) {
    console.log('✅ OCR order payment status auto-match verification passed!');
  } else {
    throw new Error('❌ OCR order payment status auto-match verification failed!');
  }

  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!');
}

runTest().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
