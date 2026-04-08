// Server-Sent Events manager for real-time updates across LAN clients
const clients = new Set();

export function addClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('\n');
  clients.add(res);

  res.on('close', () => {
    clients.delete(res);
  });
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Debounced broadcast to batch rapid changes
let pendingBroadcasts = new Map();
let broadcastTimer = null;

export function broadcastDebounced(event, data, delayMs = 100) {
  pendingBroadcasts.set(event, data);

  if (!broadcastTimer) {
    broadcastTimer = setTimeout(() => {
      for (const [evt, d] of pendingBroadcasts) {
        broadcast(evt, d);
      }
      pendingBroadcasts.clear();
      broadcastTimer = null;
    }, delayMs);
  }
}

export function getClientCount() {
  return clients.size;
}
