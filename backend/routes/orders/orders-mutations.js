const express = require('express');
const router = express.Router();
const ordersController = require('../../controllers/ordersController');

// PUT /api/orders/:id/cs-update - Advanced CS edit (Line items, Discounts, Price)
router.put('/:id/cs-update', ordersController.csUpdate);

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', ordersController.updateOrder);

// POST /api/orders/:id/address - Update order address locally and on Shopify
router.post('/:id/address', ordersController.updateAddressLocallyAndShopify);

// PUT /api/orders/:id/address - Live Update Address in Shopify
router.put('/:id/address', ordersController.updateAddressLiveShopify);

// POST /api/orders/:id/revert-confirm - Move back to Pending (CS side)
router.post('/:id/revert-confirm', ordersController.revertConfirm);

// PATCH /api/orders/:id/erp-status — Manual ERP status override (permissioned users only)
router.patch('/:id/erp-status', ordersController.patchErpStatus);

// POST /api/orders/:id/confirm - Mark as ready for booking (CS side)
router.post('/:id/confirm', ordersController.confirmOrder);

// POST /api/orders/:id/book-postex - Create a real booking in PostEx
router.post('/:id/book-postex', ordersController.bookPostex);

// POST /api/orders/:id/book-instaworld - Create a real booking in Instaworld
router.post('/:id/book-instaworld', ordersController.bookInstaworld);

// POST /api/orders/:id/cancel-booking - Cancel a booking and clear tracking
router.post('/:id/cancel-booking', ordersController.cancelBooking);

// POST /api/logistics/sync-cities - Force sync cities from courier APIs
router.post('/logistics/sync-cities', ordersController.syncCities);

// POST /api/orders/:id/resync - Force sync a specific order from Shopify
router.post('/:id/resync', ordersController.resyncOrder);

// POST /api/orders/:id/verify-address - Geocode and verify address using Google Maps Geocoding API
router.post('/:id/verify-address', ordersController.verifyAddress);

// POST /api/orders/update-legacy-financials - Run historical financials sync for all tenants
router.post('/update-legacy-financials', ordersController.updateLegacyFinancials);

module.exports = router;
