const clients = new Set();
const tenantClients = new Map();

function addClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  // Initial connection heartbeat
  res.write(':\n\n');

  // Keep alive ping every 25 seconds (prevent Heroku/Railway timeout)
  const timer = setInterval(() => {
    res.write(':\n\n');
  }, 25000);

  clients.add(res);

  req.on('close', () => {
    clearInterval(timer);
    clients.delete(res);
  });
}

function addTenantClient(tenantId, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Initial connection heartbeat
  res.write(':\n\n');

  // Keep alive ping every 25 seconds
  const timer = setInterval(() => {
    res.write(':\n\n');
  }, 25000);

  if (!tenantClients.has(tenantId)) {
    tenantClients.set(tenantId, new Set());
  }
  tenantClients.get(tenantId).add(res);

  req.on('close', () => {
    clearInterval(timer);
    const set = tenantClients.get(tenantId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        tenantClients.delete(tenantId);
      }
    }
  });
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  // 1. Broadcast to global/public clients
  clients.forEach(c => {
    try {
      c.write(payload);
    } catch (e) {
      // silent
    }
  });

  // 2. Broadcast to tenant-specific clients based on active context
  try {
    const tenantContext = require('./tenant-context');
    const tenantId = tenantContext.getStore();
    if (tenantId) {
      const set = tenantClients.get(tenantId);
      if (set) {
        set.forEach(c => {
          try {
            c.write(payload);
          } catch (e) {
            // silent
          }
        });
      }
    }
  } catch (err) {
    console.error('Failed to run tenant broadcast:', err.message);
  }
}

module.exports = { addClient, addTenantClient, broadcast };

