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
  cancelShopifyFulfillment,
  READY_TO_BOOK_TAG,
  mergeOrderTagString,
  updateShopifyOrderTag
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
  READY_TO_BOOK_TAG,
  mergeOrderTagString,
  updateShopifyOrderTag,
  syncSpecificOrders,
  fetchVariantImagesGraphQL,
  mapShopifyStatus,
  syncShopifyProduct,
  syncFullProductCatalog
};
