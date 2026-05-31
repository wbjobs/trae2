import { Context } from 'koa';
import winston from 'winston';
import ClickHouseService from '../services/ClickHouseService';
import WebSocketService from '../services/WebSocketService';
import { QueryFilters, QueryOptions } from '../models/SignalingTable';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export class QueryController {
    private clickHouseService: ClickHouseService;
    private webSocketService: WebSocketService;

    constructor() {
        this.clickHouseService = ClickHouseService.getInstance();
        this.webSocketService = WebSocketService.getInstance();
    }

    public async queryTrace(ctx: Context): Promise<void> {
        try {
            const {
                deviceId,
                deviceName,
                signalingType,
                protocol,
                sourceIp,
                destIp,
                status,
                minLength,
                maxLength,
                startTime,
                endTime,
                limit = 100,
                offset = 0,
                orderBy,
                orderDirection = 'DESC'
            } = ctx.request.body as any;

            if (!startTime || !endTime) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'startTime and endTime are required'
                };
                return;
            }

            const filters: QueryFilters = {
                deviceId,
                deviceName,
                signalingType,
                protocol,
                sourceIp,
                destIp,
                status,
                minLength,
                maxLength
            };

            const options: QueryOptions = {
                limit,
                offset,
                orderBy,
                orderDirection: orderDirection as 'ASC' | 'DESC'
            };

            const results = await this.clickHouseService.queryByTimeRange(
                startTime,
                endTime,
                filters,
                options
            );

            ctx.body = {
                success: true,
                data: results,
                total: results.length,
                filters,
                options
            };
        } catch (error) {
            logger.error('Query trace error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async getSignalingById(ctx: Context): Promise<void> {
        try {
            const { id } = ctx.params;

            if (!id) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'Signaling ID is required'
                };
                return;
            }

            const result = await this.clickHouseService.getSignalingById(id);

            if (!result) {
                ctx.status = 404;
                ctx.body = {
                    success: false,
                    error: 'Signaling message not found'
                };
                return;
            }

            ctx.body = {
                success: true,
                data: result
            };
        } catch (error) {
            logger.error('Get signaling by ID error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async getMetrics(ctx: Context): Promise<void> {
        try {
            const { interval = '1m', startTime, endTime } = ctx.query as any;

            const results = await this.clickHouseService.getMetrics(
                interval,
                startTime,
                endTime
            );

            ctx.body = {
                success: true,
                data: results,
                interval,
                startTime,
                endTime
            };
        } catch (error) {
            logger.error('Get metrics error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async getRealtime(ctx: Context): Promise<void> {
        try {
            const results = await this.clickHouseService.getRealtimeMetrics();

            ctx.body = {
                success: true,
                data: results,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Get realtime error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async searchPayload(ctx: Context): Promise<void> {
        try {
            const {
                keyword,
                deviceId,
                deviceName,
                signalingType,
                protocol,
                sourceIp,
                destIp,
                status,
                startTime,
                endTime,
                limit = 100,
                offset = 0,
                orderBy,
                orderDirection = 'DESC'
            } = ctx.request.body as any;

            if (!keyword) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'Search keyword is required'
                };
                return;
            }

            const filters: QueryFilters = {
                deviceId,
                deviceName,
                signalingType,
                protocol,
                sourceIp,
                destIp,
                status
            };

            const options: QueryOptions = {
                limit,
                offset,
                orderBy,
                orderDirection: orderDirection as 'ASC' | 'DESC'
            };

            const results = await this.clickHouseService.searchPayload(
                keyword,
                filters,
                options
            );

            ctx.body = {
                success: true,
                data: results,
                total: results.length,
                keyword,
                filters
            };
        } catch (error) {
            logger.error('Search payload error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async getDevices(ctx: Context): Promise<void> {
        try {
            const results = await this.clickHouseService.getDevices();

            ctx.body = {
                success: true,
                data: results,
                total: results.length
            };
        } catch (error) {
            logger.error('Get devices error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async getTypes(ctx: Context): Promise<void> {
        try {
            const results = await this.clickHouseService.getTypeDistribution();

            ctx.body = {
                success: true,
                data: results,
                total: results.length
            };
        } catch (error) {
            logger.error('Get types error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: (error as Error).message
            };
        }
    }

    public async healthCheck(ctx: Context): Promise<void> {
        try {
            const clickhouseHealthy = await this.clickHouseService.healthCheck();
            const wsClients = this.webSocketService.getConnectedClientsCount();

            ctx.body = {
                success: true,
                data: {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    services: {
                        clickhouse: clickhouseHealthy ? 'healthy' : 'unhealthy',
                        websocket: {
                            status: 'healthy',
                            connectedClients: wsClients
                        }
                    },
                    version: '1.0.0'
                }
            };
        } catch (error) {
            logger.error('Health check error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                data: {
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: (error as Error).message
                }
            };
        }
    }
}

export default QueryController;
