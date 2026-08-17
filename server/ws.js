import { WebSocketServer } from "ws";

const HEARTBEAT_MS = 30000;

let wss = null;

// Attaches a WebSocket server to the given HTTP server for realtime push
// notifications. Clients don't receive data over the socket itself — just a
// signal to refetch via the existing REST endpoints, so payloads stay simple
// and per-user serialization logic doesn't need to move here.
export function attach(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  const interval = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(interval));
}

export function broadcast(event) {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
