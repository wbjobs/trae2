import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { RealtimeData, SecurityData, Device, AnomalyAlert } from '../../shared/types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();
const heartbeatIntervals = new Map<WebSocket, NodeJS.Timeout>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws/realtime' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to security monitoring system',
      timestamp: Date.now()
    }));

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
    heartbeatIntervals.set(ws, heartbeat);

    ws.on('pong', () => {});

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
      const h = heartbeatIntervals.get(ws);
      if (h) { clearInterval(h); heartbeatIntervals.delete(ws); }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
      const h = heartbeatIntervals.get(ws);
      if (h) { clearInterval(h); heartbeatIntervals.delete(ws); }
    });
  });

  console.log('WebSocket server initialized on /ws/realtime');
}

export function broadcastRealtimeData(data: { type: string; data: SecurityData; device?: Device }) {
  const message = JSON.stringify({
    type: data.type,
    payload: {
      data: data.data,
      device: data.device
    },
    timestamp: Date.now()
  });

  broadcast(message);
}

export function broadcastAlert(alert: AnomalyAlert) {
  const message = JSON.stringify({
    type: 'alert',
    payload: alert,
    timestamp: Date.now()
  });

  broadcast(message);
}

export function broadcastStats(stats: any) {
  const message = JSON.stringify({
    type: 'stats',
    payload: stats,
    timestamp: Date.now()
  });

  broadcast(message);
}

function broadcast(message: string) {
  if (!wss) return;

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  });
}

export function getConnectedClientsCount(): number {
  return clients.size;
}

export default {
  initWebSocket,
  broadcastRealtimeData,
  broadcastAlert,
  broadcastStats,
  getConnectedClientsCount
};
