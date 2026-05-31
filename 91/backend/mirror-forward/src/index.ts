import dotenv from 'dotenv';
dotenv.config();

import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { Context } from 'koa';

import { logger, AppError } from 'shared/index';
import router from './routes';
import queueService from './services/QueueService';
import trafficDistributor from './services/TrafficDistributor';
import filterService from './services/FilterService';

const PORT = parseInt(process.env.PORT || '3001', 10);
const SERVICE_NAME = process.env.SERVICE_NAME || 'mirror-forward';

const app = new Koa();

app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Source-Id', 'Authorization'],
  exposeHeaders: ['Content-Length', 'Date'],
  maxAge: 86400,
}));

app.use(bodyParser({
  enableTypes: ['json'],
  jsonLimit: '10mb',
  strict: true,
  onerror: (err, ctx) => {
    logger.error('[BodyParser] Error parsing request body:', err);
    ctx.throw('Invalid JSON body', 400);
  },
}));

app.use(async (ctx: Context, next) => {
  const startTime = Date.now();
  const sourceId = ctx.get('X-Source-Id') || 'unknown';

  logger.debug(`[HTTP] ${ctx.method} ${ctx.path} - source: ${sourceId}`);

  try {
    await next();

    const duration = Date.now() - startTime;
    logger.debug(
      `[HTTP] ${ctx.method} ${ctx.path} - status: ${ctx.status} - duration: ${duration}ms`
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AppError) {
      logger.warn(
        `[HTTP] ${ctx.method} ${ctx.path} - status: ${error.statusCode} - error: ${error.message} - duration: ${duration}ms`
      );

      ctx.status = error.statusCode;
      ctx.body = {
        success: false,
        error: error.message,
        code: error.code,
      };
    } else if (error instanceof Error && (error as any).statusCode) {
      const statusCode = (error as any).statusCode;
      logger.warn(
        `[HTTP] ${ctx.method} ${ctx.path} - status: ${statusCode} - error: ${error.message} - duration: ${duration}ms`
      );

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error.message,
      };
    } else {
      logger.error(
        `[HTTP] ${ctx.method} ${ctx.path} - unhandled error - duration: ${duration}ms`,
        error
      );

      ctx.status = 500;
      ctx.body = {
        success: false,
        error: 'Internal server error',
      };
    }
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

async function startServer(): Promise<void> {
  try {
    logger.info(`[${SERVICE_NAME}] Starting service...`);
    logger.info(`[${SERVICE_NAME}] Environment: ${process.env.NODE_ENV || 'development'}`);

    await filterService.initialize();
    logger.info(`[${SERVICE_NAME}] Filter service initialized`);

    await queueService.connect();
    logger.info(`[${SERVICE_NAME}] RabbitMQ connection established`);

    const bandwidthResetInterval = trafficDistributor.startBandwidthResetInterval(1000);
    logger.info(`[${SERVICE_NAME}] Traffic distributor bandwidth reset interval started`);

    const server = app.listen(PORT, () => {
      logger.info(`[${SERVICE_NAME}] Server listening on port ${PORT}`);
      logger.info(`[${SERVICE_NAME}] Health check: http://localhost:${PORT}/api/forward/health`);
      logger.info(`[${SERVICE_NAME}] Distribution API: http://localhost:${PORT}/api/distribution`);
      logger.info(`[${SERVICE_NAME}] Service started successfully`);
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    const shutdown = async (signal: string) => {
      logger.info(`[${SERVICE_NAME}] Received ${signal}, initiating graceful shutdown...`);

      clearInterval(bandwidthResetInterval);
      logger.info(`[${SERVICE_NAME}] Traffic distributor bandwidth reset interval stopped`);

      server.close(async () => {
        logger.info(`[${SERVICE_NAME}] HTTP server closed`);

        try {
          await filterService.close();
          logger.info(`[${SERVICE_NAME}] Filter service closed`);
        } catch (error) {
          logger.error(`[${SERVICE_NAME}] Error closing filter service:`, error);
        }

        try {
          await queueService.close();
          logger.info(`[${SERVICE_NAME}] Queue service closed`);
        } catch (error) {
          logger.error(`[${SERVICE_NAME}] Error closing queue service:`, error);
        }

        logger.info(`[${SERVICE_NAME}] Graceful shutdown complete`);
        process.exit(0);
      });

      setTimeout(() => {
        logger.error(`[${SERVICE_NAME}] Forced shutdown after timeout`);
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error(`[${SERVICE_NAME}] Uncaught exception:`, error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`[${SERVICE_NAME}] Unhandled rejection at:`, promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Failed to start server:`, error);
    process.exit(1);
  }
}

startServer();

export default app;
