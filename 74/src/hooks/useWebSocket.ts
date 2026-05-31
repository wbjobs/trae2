import { useEffect, useRef, useCallback } from 'react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { SecurityData, AnomalyAlert, Device } from '../../shared/types.js';

interface WebSocketMessage {
  type: string;
  payload?: {
    data?: SecurityData;
    device?: Device;
  } | AnomalyAlert | any;
  timestamp: number;
}

interface UseWebSocketOptions {
  onData?: (data: SecurityData) => void;
  onAlert?: (alert: AnomalyAlert) => void;
  onStats?: (stats: any) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const addRealtimeData = useSecurityStore(state => state.addRealtimeData);
  const addAlert = useSecurityStore(state => state.addAlert);

  const connect = useCallback(() => {
    const wsUrl = 'ws://localhost:3001/ws/realtime';

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === 'pong' || message.type === 'welcome') return;

          if (message.type === 'data' && message.payload?.data) {
            addRealtimeData(message.payload.data);
            options.onData?.(message.payload.data);
          } else if (message.type === 'alert') {
            const alert = message.payload as AnomalyAlert;
            addAlert(alert);
            options.onAlert?.(alert);
          } else if (message.type === 'stats') {
            options.onStats?.(message.payload);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onerror = () => {};

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      }
    }
  }, [addRealtimeData, addAlert, options.onData, options.onAlert, options.onStats]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}

export default useWebSocket;
