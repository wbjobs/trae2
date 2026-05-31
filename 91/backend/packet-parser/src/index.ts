import 'dotenv/config';
import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { logger } from '../../shared/logger';
import router from './routes';
import packetCaptureService from './services/PacketCaptureService';

const app = new Koa();
const PORT = parseInt(process.env.PORT || '3002');

app.use(cors());
app.use(bodyParser({
  jsonLimit: '10mb',
  formLimit: '10mb'
}));

app.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();
    const duration = Date.now() - start;
    logger.info(`${ctx.method} ${ctx.path} - ${ctx.status} - ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`${ctx.method} ${ctx.path} - ${ctx.status} - ${duration}ms`, error);
    throw error;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    success: false,
    error: `Endpoint ${ctx.method} ${ctx.path} not found`
  };
});

const server = app.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`Packet Parser Service`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Mirror Forward URL: ${process.env.MIRROR_FORWARD_URL}`);
  logger.info(`Available interfaces: ${packetCaptureService.getInterfaces().map(i => i.id).join(', ')}`);
  logger.info(`Simulated devices: ${packetCaptureService.getDevices().length}`);
  logger.info(`=================================`);
  logger.info('API Endpoints:');
  logger.info('  GET  /api/capture/start?iface=eth0    - Start capture');
  logger.info('  GET  /api/capture/stop?iface=eth0     - Stop capture');
  logger.info('  GET  /api/capture/status              - Get capture status');
  logger.info('  POST /api/capture/parse               - Parse packet data');
  logger.info('  GET  /api/capture/generate?count=100  - Generate test packets');
  logger.info('  GET  /api/capture/health              - Health check');
  logger.info(`=================================`);
});

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  packetCaptureService.stopAllCaptures();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
