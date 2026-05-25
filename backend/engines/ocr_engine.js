/**
 * 🔍 TRACE ERP: Receipt OCR (Payment Scanner) Engine
 * Passes uploaded customer payment screenshots through OCR to detect IBFT transactions.
 * FULLY fire-and-forget via setImmediate.
 * 
 * Antigravity Rule F: OCR failure MUST NOT affect message pipeline.
 */
const fs = require('fs');
const { db } = require('../db');

async function scanReceiptOCR(phone, orderId, dbMessageId, imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn(`🔍 OCR: Image not found: ${imagePath}`);
    return;
  }

  const provider = process.env.OCR_PROVIDER || 'openai';

  try {
    let rawResult = null;
    let detectedAmount = null;
    let detectedTxnId = null;
    let detectedBank = null;
    let confidence = 0;
    let status = 'pending';

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) { console.warn('🔍 OCR: OPENAI_API_KEY not set'); return; }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const ext = imagePath.split('.').pop().toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is a Pakistani bank payment screenshot. Extract payment details and return ONLY valid JSON with these fields: { "is_payment_receipt": boolean, "payment_type": string (e.g. IBFT, EasyPaisa, JazzCash, Raast), "amount": number or null, "txn_id": string or null, "bank_name": string or null, "sender_name": string or null, "datetime": string or null, "confidence": number between 0 and 1 }. If not a payment receipt, set is_payment_receipt to false.'
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' }
              }
            ]
          }],
          max_tokens: 300,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await res.json();
      rawResult = data?.choices?.[0]?.message?.content || null;

      if (rawResult) {
        try {
          const parsed = JSON.parse(rawResult);
          detectedAmount = parsed.amount || null;
          detectedTxnId = parsed.txn_id || null;
          detectedBank = parsed.bank_name || null;
          confidence = parsed.confidence || 0;

          if (!parsed.is_payment_receipt) {
            status = 'not_a_receipt';
          } else {
            // Check if amount matches order
            if (orderId && detectedAmount) {
              const order = db.prepare('SELECT total_price, price FROM orders WHERE id = ?').get(orderId);
              const orderAmount = order?.total_price || order?.price || 0;
              const amountDiff = Math.abs(detectedAmount - orderAmount);
              if (amountDiff <= 50) { // Rs. 50 tolerance
                status = 'matched';
                // Auto-update order payment status
                db.prepare(`
                  UPDATE orders SET payment_status = 'OCR Verified', payment_ref = ?, paid_amount = ?
                  WHERE id = ?
                `).run(detectedTxnId || 'OCR', detectedAmount, orderId);
                console.log(`🔍 OCR: Payment MATCHED for order ${orderId} — Rs.${detectedAmount}`);
              } else {
                status = 'mismatch';
              }
            } else {
              status = 'manual_review';
            }
          }
        } catch(_){}
      }
    }

    // Persist OCR scan result
    db.prepare(`
      INSERT INTO payment_ocr_scans
      (order_id, phone, image_path, raw_ocr_result, detected_amount, detected_txn_id, detected_bank, confidence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId || null, phone, imagePath, rawResult, detectedAmount, detectedTxnId, detectedBank, confidence, status);

    console.log(`🔍 OCR: Scan complete for ${phone} — status: ${status}, amount: ${detectedAmount}`);

    // Broadcast result to portal via WebSocket
    try {
      const { broadcast } = require('../websocket');
      broadcast('ocr_result', {
        phone,
        messageId: dbMessageId,
        status,
        detectedAmount,
        detectedTxnId,
        detectedBank,
        confidence
      });
    } catch(_){}

  } catch (err) {
    console.error('🔍 OCR engine error:', err.message);
    // Fail silently — Rule F
  }
}

module.exports = { scanReceiptOCR };
