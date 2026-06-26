const checkStoreAccess = (req, res, next) => {
  // If not authenticated yet (public routes), bypass
  if (!req.user) {
    return next();
  }

  // Super Admins have unrestricted access to all stores
  if (req.user.role === 'admin') {
    return next();
  }

  // Extract requested store ID from query, body, parameters, or active store header
  const storeIdVal = req.query.store_id || req.body.store_id || req.params.store_id || req.headers['x-active-store-id'];

  if (!storeIdVal) {
    return next();
  }

  const requestedStoreId = Number(storeIdVal);
  if (isNaN(requestedStoreId)) {
    return next();
  }

  // Check user's allowed stores list parsed from JWT payload
  const allowedStores = Array.isArray(req.user.allowed_stores) ? req.user.allowed_stores : [];

  if (!allowedStores.includes(requestedStoreId)) {
    return res.status(403).json({
      error: `Forbidden: You do not have permission to access data for Store ID ${requestedStoreId}`
    });
  }

  next();
};

module.exports = checkStoreAccess;
