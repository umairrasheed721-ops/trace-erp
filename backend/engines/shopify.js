const {
  fetchShopifyOrders,
  refreshShopifyUpdates,
  syncSingleShopifyOrder,
  syncOrderByNumber,
  syncSpecificOrders,
  mapShopifyStatus
} = require('./shopify/orders');

const {
  fulfillShopifyOrder,
  updateShopifyAddress,
  registerShopifyWebhooks,
  cancelShopifyFulfillment
} = require('./shopify/fulfillments');

const {
  getLiveShopifyCosts,
  fetchVariantImagesGraphQL,
  syncShopifyProduct,
  syncFullProductCatalog
} = require('./shopify/products');

module.exports = {
  fetchShopifyOrders,
  refreshShopifyUpdates,
  getLiveShopifyCosts,
  syncSingleShopifyOrder,
  syncOrderByNumber,
  registerShopifyWebhooks,
  fulfillShopifyOrder,
  updateShopifyAddress,
  cancelShopifyFulfillment,
  syncSpecificOrders,
  fetchVariantImagesGraphQL,
  mapShopifyStatus,
  syncShopifyProduct,
  syncFullProductCatalog
};
