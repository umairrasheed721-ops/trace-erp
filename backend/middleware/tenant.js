const tenantContext = require('../tenant-context');

const tenantMiddleware = (req, res, next) => {
  // If req.user is set (after JWT verification), derive tenant ID from it
  if (req.user) {
    const jwtTenantId = req.user.tenant_id;
    if (!jwtTenantId) {
      return res.status(403).json({ error: 'Forbidden: Tenant ID missing from token' });
    }

    const clientTenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    // If client supplied a tenant ID, it must match the one in the JWT
    if (clientTenantId && clientTenantId !== jwtTenantId) {
      return res.status(403).json({ error: 'Forbidden: Tenant ID mismatch' });
    }

    req.tenantId = jwtTenantId;
    tenantContext.run(jwtTenantId, next);
  } else {
    // For unauthenticated/public routes, fallback to client-supplied tenant ID or 'default'
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || 'default';
    req.tenantId = tenantId;
    tenantContext.run(tenantId, next);
  }
};

module.exports = tenantMiddleware;
