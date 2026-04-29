const clients = new Set();

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

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(payload));
}

module.exports = { addClient, broadcast };
