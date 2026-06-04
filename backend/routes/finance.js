const express = require('express');
const router = express.Router();

// Mount split sub-routers
router.use('/', require('./finance/finance-sessions'));
router.use('/', require('./finance/finance-corrections'));
router.use('/', require('./finance/finance-exports'));

module.exports = router;
