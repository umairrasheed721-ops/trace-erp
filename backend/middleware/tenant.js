const tenantContext = require('../tenant-context');

const tenantMiddleware = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || 'default';
  req.tenantId = tenantId;
  tenantContext.run(tenantId, next);
};

module.exports = tenantMiddleware;
