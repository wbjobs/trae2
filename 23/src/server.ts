import { createApp } from './app';
import { config } from './config/environment';
import logger from './utils/logger';
import { initializeDatabase, closeDatabase } from './database/data-source';
import { messageQueueService } from './services/message-queue.service';
import { distributedLockService } from './services/distributed-lock.service';
import { initializeServices, shutdownServices } from './services/service-bootstrap';

const app = createApp();

async function startServer(): Promise<void> {
  try {
    await initializeDatabase();
    await messageQueueService.connect();

    await initializeServices();

    const server = app.listen(config.server.port, () => {
      logger.info(`Server started successfully`, {
        port: config.server.port,
        environment: config.server.nodeEnv,
        workerId: process.env.WORKER_ID || 'master',
        pid: process.pid,
      });
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await shutdownServices();
          await messageQueueService.close();
          distributedLockService.disconnect();
          await closeDatabase();
          logger.info('All connections closed gracefully');
          process.exit(0);
        } catch (err) {
          logger.error('Error during graceful shutdown:', err);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
