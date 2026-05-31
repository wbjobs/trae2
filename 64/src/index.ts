import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import logger from './utils/logger';
import routes from './routes';
import { redisClient } from './cache/redis';
import { taskScheduler } from './task/scheduler';
import { callbackScheduler } from './callback/scheduler';
import { rateLimitMiddleware } from './auth/middleware';
import { globalCircuitBreakerMiddleware } from './middleware/circuitBreaker';
import { healthCheckHandler, livenessCheckHandler, readinessCheckHandler } from './middleware/healthCheck';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', healthCheckHandler);
app.get('/health/live', livenessCheckHandler);
app.get('/health/ready', readinessCheckHandler);

app.use(rateLimitMiddleware);
app.use(globalCircuitBreakerMiddleware);

app.use((req, _res, next) => {
  logger.debug('请求进入', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

app.use('/api/v1', routes);

app.use((_req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    timestamp: Date.now(),
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('服务异常', { error: err.message, stack: err.stack });
  res.status(500).json({
    code: 500,
    message: '服务内部错误',
    timestamp: Date.now(),
  });
});

const startServer = async () => {
  try {
    redisClient.connect();

    const server = app.listen(config.port, () => {
      logger.info(`气象雷达 API 服务已启动`, {
        port: config.port,
        env: config.env,
      });

      taskScheduler.start();
      callbackScheduler.start();

      logger.info('任务调度器和回调调度器已启动');
    });

    const shutdown = (signal: string) => {
      logger.info(`收到 ${signal} 信号，正在关闭服务...`);
      server.close(() => {
        taskScheduler.stop();
        callbackScheduler.stop();
        redisClient.disconnect();
        logger.info('服务已正常关闭');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('强制关闭服务');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.error('未捕获的异常', { error: err });
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('未处理的 Promise 拒绝', { reason });
    });
  } catch (err) {
    logger.error('服务启动失败', { error: err });
    process.exit(1);
  }
};

startServer();

export default app;
