const express = require('express');
const router = express.Router();

// Mount split sub-routers
router.use('/', require('./orders/orders-query'));
router.use('/', require('./orders/orders-mutations'));
router.use('/', require('./orders/orders-bulk'));

module.exports = router;
