const express = require('express');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const { db } = require('./db');
const tenantContext = require('./tenant-context');
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET missing');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Initialize mock DB records
async function setupMockData() {
  console.log('Setting up mock database records...');
  
  tenantContext.run('default', () => {
    // Clean up
    try { db.prepare('DELETE FROM orders WHERE id IN (99991, 99992)').run(); } catch(e){}
    try { db.prepare('DELETE FROM whatsapp_messages WHERE order_id IN (99991, 99992) OR id IN (99991, 99992)').run(); } catch(e){}
    try { db.prepare('DELETE FROM stores WHERE id = 1').run(); } catch(e){}
    
    // Insert
    db.prepare(`
      INSERT INTO stores (id, shop_domain, access_token)
      VALUES (1, 'store_a.myshopify.com', 'token_a')
    `).run();
    db.prepare(`
      INSERT INTO orders (id, store_id, shopify_order_id, phone, customer_name, tenant_id)
      VALUES (99991, 1, 'shopify_99991', '923001234567', 'Tenant A Customer', 'default')
    `).run();
    db.prepare(`
      INSERT INTO whatsapp_messages (id, store_id, order_id, phone, direction, message, status, tenant_id)
      VALUES (99991, 1, 99991, '923001234567', 'outgoing', 'Hello from Tenant A', 'sent', 'default')
    `).run();
  });

  tenantContext.run('tenant_b', () => {
    // Clean up
    try { db.prepare('DELETE FROM orders WHERE id IN (99991, 99992)').run(); } catch(e){}
    try { db.prepare('DELETE FROM whatsapp_messages WHERE order_id IN (99991, 99992) OR id IN (99991, 99992)').run(); } catch(e){}
    try { db.prepare('DELETE FROM stores WHERE id = 1').run(); } catch(e){}
    
    // Insert
    db.prepare(`
      INSERT INTO stores (id, shop_domain, access_token)
      VALUES (1, 'store_b.myshopify.com', 'token_b')
    `).run();
    db.prepare(`
      INSERT INTO orders (id, store_id, shopify_order_id, phone, customer_name, tenant_id)
      VALUES (99992, 1, 'shopify_99992', '923001234568', 'Tenant B Customer', 'tenant_b')
    `).run();
    db.prepare(`
      INSERT INTO whatsapp_messages (id, store_id, order_id, phone, direction, message, status, tenant_id)
      VALUES (99992, 1, 99992, '923001234568', 'outgoing', 'Hello from Tenant B', 'sent', 'tenant_b')
    `).run();
  });

  console.log('Mock records configured.');
}

async function runTests() {
  await setupMockData();

  // Create JWTs
  const tokenA = jwt.sign({ id: 1, username: 'admin_a', role: 'admin', tenant_id: 'default' }, JWT_SECRET);
  const tokenB = jwt.sign({ id: 2, username: 'admin_b', role: 'admin', tenant_id: 'tenant_b' }, JWT_SECRET);

  const app = express();
  app.use(express.json());
  
  // Authenticate token (simplified backend index.js logic)
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Auth required' });
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch(err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Set tenant context (runs after authentication so it can verify req.user.tenant_id)
  const tenantMiddleware = require('./middleware/tenant');
  app.use(tenantMiddleware);

  const governanceRouter = require('./routes/whatsapp-governance');
  app.use('/api/whatsapp-governance', governanceRouter);

  // Start temporary server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/whatsapp-governance`;
  console.log(`Test server running on port ${port}...`);

  let failures = 0;

  async function checkRoute(label, path, token, tenantHeader, expectedStatus, assertFn, method = 'GET', body = null) {
    try {
      const headers = {
        'Authorization': `Bearer ${token}`
      };
      if (tenantHeader) {
        headers['x-tenant-id'] = tenantHeader;
      }
      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      const status = res.status;
      
      let data = null;
      try {
        data = await res.json();
      } catch (err) {}

      if (status !== expectedStatus) {
        console.error(`❌ [${label}] FAILED: Expected status ${expectedStatus}, got ${status}`);
        if (data) console.error('Response data:', data);
        failures++;
        return;
      }

      if (assertFn && status === 200) {
        try {
          assertFn(data);
        } catch (err) {
          console.error(`❌ [${label}] Assertion FAILED:`, err.message);
          if (data) console.error('Response data:', data);
          failures++;
          return;
        }
      }

      console.log(`✅ [${label}] PASSED (Status: ${status})`);
    } catch (err) {
      console.error(`❌ [${label}] ERROR:`, err.message);
      failures++;
    }
  }

  // TEST CASES

  // 1. GET /chat/:order_id - Tenant A fetches their own order
  await checkRoute(
    'GET /chat/99991 - Tenant A accessing own order',
    '/chat/99991',
    tokenA,
    'default',
    200,
    (data) => {
      if (data.order.id !== 99991) throw new Error('Returned wrong order');
      if (data.messages.length !== 1 || data.messages[0].id !== 99991) throw new Error('Returned wrong messages');
    }
  );

  // 2. GET /chat/:order_id - Tenant B tries to fetch Tenant A's order (should 404)
  await checkRoute(
    'GET /chat/99991 - Tenant B accessing Tenant A order (404 expected)',
    '/chat/99991',
    tokenB,
    'tenant_b',
    404
  );

  // 3. GET /chat/:order_id - Tenant B tries to fetch Tenant A's order using tenant header bypass attempt (should 403)
  await checkRoute(
    'GET /chat/99991 - Tenant B bypass attempt via header (403 expected)',
    '/chat/99991',
    tokenB,
    'default',
    403
  );

  // 4. POST /chat/:order_id/send - Tenant A sending message to own order
  await checkRoute(
    'POST /chat/99991/send - Tenant A sending message',
    '/chat/99991/send',
    tokenA,
    'default',
    200,
    null,
    'POST',
    { message: 'Hello Support' }
  );

  // 5. POST /chat/:order_id/send - Tenant B trying to send message to Tenant A order
  await checkRoute(
    'POST /chat/99991/send - Tenant B sending message to Tenant A (404 expected)',
    '/chat/99991/send',
    tokenB,
    'tenant_b',
    404,
    null,
    'POST',
    { message: 'Hack attempt' }
  );

  // 6. GET /chats/:phone - Tenant A fetches own chat
  await checkRoute(
    'GET /chats/923001234567 - Tenant A accessing own chat',
    '/chats/923001234567',
    tokenA,
    'default',
    200,
    (data) => {
      if (data.phone !== '923001234567') throw new Error('Wrong phone number');
      if (data.messages.length === 0) throw new Error('No messages returned');
    }
  );

  // 7. GET /chats/:phone - Tenant B tries to access Tenant A's chat (404 expected)
  await checkRoute(
    'GET /chats/923001234567 - Tenant B accessing Tenant A chat (404 expected)',
    '/chats/923001234567',
    tokenB,
    'tenant_b',
    404
  );

  // 8. GET /chats - Verify index only returns correct tenant's chats
  await checkRoute(
    'GET /chats - Tenant B gets only their chats',
    '/chats',
    tokenB,
    'tenant_b',
    200,
    (data) => {
      const wrongChats = data.chats.filter(c => c.phone === '923001234567');
      if (wrongChats.length > 0) throw new Error('Bled chats from Tenant A');
    }
  );

  // 9. GET /chats/:phone/risk-profile - Tenant A accessing own risk profile
  await checkRoute(
    'GET /chats/923001234567/risk-profile - Tenant A own profile',
    '/chats/923001234567/risk-profile',
    tokenA,
    'default',
    200
  );

  // 10. GET /chats/:phone/risk-profile - Tenant B accessing Tenant A's risk profile (404 expected)
  await checkRoute(
    'GET /chats/923001234567/risk-profile - Tenant B accessing Tenant A profile (404 expected)',
    '/chats/923001234567/risk-profile',
    tokenB,
    'tenant_b',
    404
  );

  // Close server
  server.close();
  console.log('\n----------------------------------------');
  if (failures > 0) {
    console.error(`❌ Isolation tests completed with ${failures} failure(s).`);
    process.exit(1);
  } else {
    console.log('🎉 All SQL tenant isolation test cases passed successfully!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
