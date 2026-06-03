const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss = null;
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET missing');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

function initWebSocket(server) {
  wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    // Authenticate WebSocket connections using JWT token in query string
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      jwt.verify(token, JWT_SECRET);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log('🔌 WebSocket Client Connected to ERP');

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket Client Disconnected from ERP');
    });

    ws.on('error', (err) => {
      console.error('⚠️ WebSocket error:', err.message);
    });
  });
}

function broadcast(event, data) {
  if (!wss) return;
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('⚠️ WebSocket send failed:', err.message);
      }
    }
  });
}

module.exports = { initWebSocket, broadcast };
