import 'dotenv/config';
import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { createServer } from 'http';
import winston from 'winston';
import router from './routes';
import ClickHouseService from './services/ClickHouseService';
import WebSocketService from './services/WebSocketService';
import AlertService from './services/AlertService';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

const app = new Koa();
const PORT = process.env.PORT || 3003;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
}));

app.use(bodyParser({
    jsonLimit: '10mb',
    formLimit: '10mb'
}));

app.use(async (ctx, next) => {
    const start = Date.now();
    logger.info(`${ctx.method} ${ctx.url} - Start`);
    try {
        await next();
        const duration = Date.now() - start;
        logger.info(`${ctx.method} ${ctx.url} - ${ctx.status} - ${duration}ms`);
    } catch (error) {
        const duration = Date.now() - start;
        logger.error(`${ctx.method} ${ctx.url} - Error - ${duration}ms:`, error);
        ctx.status = 500;
        ctx.body = {
            success: false,
            error: (error as Error).message
        };
    }
});

app.use(router.routes());
app.use(router.allowedMethods());

const server = createServer(app.callback());

async function bootstrap() {
    try {
        logger.info('Starting signaling trace retrieval service...');

        const clickHouseService = ClickHouseService.getInstance();
        await clickHouseService.initDatabase();
        logger.info('ClickHouse database initialized successfully');

        const alertService = AlertService.getInstance();
        logger.info('Alert service initialized successfully');

        const webSocketService = WebSocketService.getInstance();
        webSocketService.attachToServer(server);
        webSocketService.startBroadcasting(2000);
        logger.info('WebSocket service started with 2-second broadcast interval');

        server.listen(PORT, () => {
            logger.info(`Server is running on http://localhost:${PORT}`);
            logger.info(`WebSocket is running on ws://localhost:${PORT}`);
            logger.info(`Health check: http://localhost:${PORT}/api/query/health`);
            logger.info(`Alert API: http://localhost:${PORT}/api/alerts`);
        });

        const shutdown = async () => {
            logger.info('Shutting down gracefully...');
            server.close(() => {
                logger.info('HTTP server closed');
            });
            webSocketService.close();
            alertService.close();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error) {
        logger.error('Failed to start service:', error);
        process.exit(1);
    }
}

bootstrap();
