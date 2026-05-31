import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import winston from 'winston';
import ClickHouseService from './ClickHouseService';
import AlertService from './AlertService';
import { SignalingMessage } from '../../../shared/types';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

interface ClientSubscription {
    deviceIds: string[];
    signalingTypes: string[];
    alerts: boolean;
}

interface ConnectedClient {
    ws: WebSocket;
    subscription: ClientSubscription;
}

export class WebSocketService {
    private wss: WebSocketServer;
    private clients: Map<string, ConnectedClient>;
    private broadcastInterval: NodeJS.Timeout | null;
    private static instance: WebSocketService;
    private clickHouseService: ClickHouseService;
    private alertService: AlertService;

    private constructor() {
        this.clients = new Map();
        this.broadcastInterval = null;
        this.wss = new WebSocketServer({ noServer: true });
        this.clickHouseService = ClickHouseService.getInstance();
        this.alertService = AlertService.getInstance();
        this.setupConnectionHandler();
    }

    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    public attachToServer(server: Server): void {
        server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                this.wss.emit('connection', ws, request);
            });
        });
    }

    private setupConnectionHandler(): void {
        this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
            const clientId = this.generateClientId(request);
            logger.info(`New WebSocket client connected: ${clientId}`);

            this.clients.set(clientId, {
                ws,
                subscription: {
                    deviceIds: [],
                    signalingTypes: [],
                    alerts: false
                }
            });
            this.alertService.registerConnection(ws);

            ws.on('message', (data: string) => {
                this.handleClientMessage(clientId, data);
            });

            ws.on('close', () => {
                this.handleClientDisconnect(clientId);
            });

            ws.on('error', (error) => {
                logger.error(`WebSocket error for client ${clientId}:`, error);
                this.handleClientDisconnect(clientId);
            });

            this.sendToClient(clientId, {
                type: 'connected',
                data: {
                    clientId,
                    message: 'Welcome to signaling trace WebSocket service'
                }
            });
        });
    }

    private generateClientId(request: IncomingMessage): string {
        const ip = request.socket.remoteAddress || 'unknown';
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${ip}-${timestamp}-${random}`;
    }

    private handleClientMessage(clientId: string, data: string): void {
        try {
            const message = JSON.parse(data);
            const client = this.clients.get(clientId);

            if (!client) {
                return;
            }

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscription(clientId, message.data);
                    break;
                case 'unsubscribe':
                    this.handleUnsubscription(clientId, message.data);
                    break;
                case 'subscribe_alerts':
                    this.handleAlertSubscription(clientId, true);
                    break;
                case 'unsubscribe_alerts':
                    this.handleAlertSubscription(clientId, false);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', data: { timestamp: Date.now() } });
                    break;
                default:
                    logger.warn(`Unknown message type from client ${clientId}: ${message.type}`);
                    this.sendToClient(clientId, {
                        type: 'error',
                        data: { message: `Unknown message type: ${message.type}` }
                    });
            }
        } catch (error) {
            logger.error(`Failed to parse message from client ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Invalid JSON message' }
            });
        }
    }

    private handleSubscription(clientId: string, data: any): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        if (data.deviceIds && Array.isArray(data.deviceIds)) {
            client.subscription.deviceIds = [...new Set([...client.subscription.deviceIds, ...data.deviceIds])];
        }
        if (data.signalingTypes && Array.isArray(data.signalingTypes)) {
            client.subscription.signalingTypes = [...new Set([...client.subscription.signalingTypes, ...data.signalingTypes])];
        }

        logger.info(`Client ${clientId} subscribed - devices: [${client.subscription.deviceIds.join(', ')}], types: [${client.subscription.signalingTypes.join(', ')}]`);

        this.sendToClient(clientId, {
            type: 'subscribed',
            data: {
                subscription: client.subscription
            }
        });
    }

    private handleUnsubscription(clientId: string, data: any): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        if (data.deviceIds && Array.isArray(data.deviceIds)) {
            client.subscription.deviceIds = client.subscription.deviceIds.filter(
                id => !data.deviceIds.includes(id)
            );
        }
        if (data.signalingTypes && Array.isArray(data.signalingTypes)) {
            client.subscription.signalingTypes = client.subscription.signalingTypes.filter(
                type => !data.signalingTypes.includes(type)
            );
        }

        logger.info(`Client ${clientId} unsubscribed - devices: [${client.subscription.deviceIds.join(', ')}], types: [${client.subscription.signalingTypes.join(', ')}]`);

        this.sendToClient(clientId, {
            type: 'unsubscribed',
            data: {
                subscription: client.subscription
            }
        });
    }

    private handleAlertSubscription(clientId: string, subscribe: boolean): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        client.subscription.alerts = subscribe;

        logger.info(`Client ${clientId} ${subscribe ? 'subscribed to' : 'unsubscribed from'} alerts`);

        this.sendToClient(clientId, {
            type: subscribe ? 'alerts_subscribed' : 'alerts_unsubscribed',
            data: {
                alertsEnabled: subscribe
            }
        });
    }

    private handleClientDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            this.alertService.unregisterConnection(client.ws);
        }
        logger.info(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
    }

    public processSignalingMessage(message: SignalingMessage): void {
        this.alertService.checkMessage(message);
    }

    private sendToClient(clientId: string, message: any): void {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    public startBroadcasting(intervalMs: number = 2000): void {
        if (this.broadcastInterval) {
            this.stopBroadcasting();
        }

        logger.info(`Starting WebSocket broadcast with ${intervalMs}ms interval`);
        this.broadcastInterval = setInterval(() => {
            this.broadcastRealtimeMetrics();
        }, intervalMs);
    }

    public stopBroadcasting(): void {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
            this.broadcastInterval = null;
            logger.info('WebSocket broadcast stopped');
        }
    }

    private async broadcastRealtimeMetrics(): Promise<void> {
        if (this.clients.size === 0) {
            return;
        }

        try {
            const metrics = await this.clickHouseService.getRealtimeMetrics();

            this.clients.forEach((client, clientId) => {
                if (client.ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                let filteredMetrics = metrics;

                if (client.subscription.deviceIds.length > 0) {
                    filteredMetrics = {
                        ...metrics,
                        byDevice: metrics.byDevice.filter(d =>
                            client.subscription.deviceIds.includes(d.device_id || '')
                        ),
                        total: metrics.byDevice
                            .filter(d => client.subscription.deviceIds.includes(d.device_id || ''))
                            .reduce((sum, d) => sum + d.count, 0)
                    };
                }

                if (client.subscription.signalingTypes.length > 0) {
                    filteredMetrics = {
                        ...filteredMetrics,
                        byType: metrics.byType.filter(t =>
                            client.subscription.signalingTypes.includes(t.signaling_type || '')
                        )
                    };
                }

                this.sendToClient(clientId, {
                    type: 'realtime_metrics',
                    data: filteredMetrics,
                    timestamp: new Date().toISOString()
                });
            });
        } catch (error) {
            logger.error('Failed to broadcast realtime metrics:', error);
        }
    }

    public broadcastMessage(message: any): void {
        const messageStr = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageStr);
            }
        });
    }

    public getConnectedClientsCount(): number {
        return this.clients.size;
    }

    public close(): void {
        this.stopBroadcasting();
        this.wss.close(() => {
            logger.info('WebSocket server closed');
        });
    }
}

export default WebSocketService;
