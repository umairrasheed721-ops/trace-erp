const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/ai/stats
router.get('/stats', (req, res) => {
  try {
    const config = {
      sttProvider: process.env.STT_PROVIDER || 'groq',
      sttLanguage: process.env.STT_LANGUAGE || 'ur',
      ocrProvider: process.env.OCR_PROVIDER || 'openai',
      ocrModel: 'gpt-4o',
      toleranceAmount: 50
    };

    // Count statistics from DB
    const totalScans = db.prepare(`SELECT COUNT(*) as count FROM payment_ocr_scans`).get().count;
    const matchedScans = db.prepare(`SELECT COUNT(*) as count FROM payment_ocr_scans WHERE status = 'matched'`).get().count;
    const mismatchedScans = db.prepare(`SELECT COUNT(*) as count FROM payment_ocr_scans WHERE status = 'mismatch'`).get().count;
    const manualReviewScans = db.prepare(`SELECT COUNT(*) as count FROM payment_ocr_scans WHERE status = 'manual_review'`).get().count;
    const nonReceiptScans = db.prepare(`SELECT COUNT(*) as count FROM payment_ocr_scans WHERE status = 'not_a_receipt'`).get().count;

    const totalAudioTranscripts = db.prepare(`SELECT COUNT(*) as count FROM whatsapp_messages WHERE media_type = 'audio' AND transcript IS NOT NULL`).get().count;

    const recentScans = db.prepare(`
      SELECT p.*, o.ref_number, o.customer_name 
      FROM payment_ocr_scans p
      LEFT JOIN orders o ON p.order_id = o.id
      ORDER BY p.id DESC LIMIT 15
    `).all();

    const recentTranscripts = db.prepare(`
      SELECT m.id, m.order_id, m.phone, m.transcript, m.transcript_at, o.ref_number, o.customer_name
      FROM whatsapp_messages m
      LEFT JOIN orders o ON m.order_id = o.id
      WHERE m.media_type = 'audio' AND m.transcript IS NOT NULL
      ORDER BY m.id DESC LIMIT 15
    `).all();

    res.json({
      config,
      stats: {
        totalScans,
        matchedScans,
        mismatchedScans,
        manualReviewScans,
        nonReceiptScans,
        totalAudioTranscripts,
        matchRate: totalScans > 0 ? ((matchedScans / totalScans) * 100).toFixed(1) : 0
      },
      recentScans,
      recentTranscripts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
