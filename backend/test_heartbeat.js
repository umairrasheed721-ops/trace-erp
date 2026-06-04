const tenantContext = require('./tenant-context');
const db = require('./db');
const bot = require('./engines/whatsapp_bot');
const statusRoutes = require('./routes/whatsapp-governance');

// Find the handler for GET /status (supports nested sub-routers)
function findHandler(router, path, method) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack[0].handle;
    }
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const handler = findHandler(layer.handle, path, method);
      if (handler) return handler;
    }
  }
  return null;
}
const statusHandler = findHandler(statusRoutes, '/status', 'get');

async function testHeartbeat() {
  console.log('🧪 Starting Heartbeat Engine Verification...');

  // Helper mock for req/res
  const mockReqRes = (tenantId) => {
    return new Promise((resolve, reject) => {
      const req = {
        query: { tenant_id: tenantId },
        headers: { 'x-tenant-id': tenantId }
      };
      const res = {
        json: (data) => resolve(data),
        status: (code) => {
          return {
            json: (errData) => reject(new Error(`Status ${code}: ${JSON.stringify(errData)}`))
          };
        }
      };
      
      tenantContext.run(tenantId, () => {
        statusHandler(req, res);
      });
    });
  };

  // Perform status fetch in 'default' context
  console.log('\n--- Fetching status for Default Tenant ---');
  const bodyDefault = await mockReqRes('default');
  console.log('Default Tenant status response payload:');
  console.log(JSON.stringify(bodyDefault, null, 2));

  // Perform status fetch in 'tenant_a' context
  console.log('\n--- Fetching status for Tenant A ---');
  const bodyTenantA = await mockReqRes('tenant_a');
  console.log('Tenant A status response payload:');
  console.log(JSON.stringify(bodyTenantA, null, 2));

  console.log('\n✅ Heartbeat verification completed successfully!');
}

testHeartbeat().catch(console.error);
