const express = require('express');
const router = express.Router();
const { runStorageAudit } = require('../scripts/storage_audit');

// GET /api/system/storage-audit
router.get('/storage-audit', (req, res) => {
  try {
    const auditData = runStorageAudit(false);
    res.json(auditData);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
