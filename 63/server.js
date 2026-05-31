const app = require('./app');
const { config } = require('./config');
const logger = require('./utils/logger');

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Pipeline Corrosion Monitoring API server started on port ${PORT}`);
  logger.info(`📊 Environment: ${config.nodeEnv}`);
  logger.info(`🔧 Worker ID: ${process.env.WORKER_ID || 'master'}`);
  logger.info(`📡 API endpoint: http://localhost:${PORT}`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/api/v1/health`);
});

server.keepAliveTimeout = 61000;
server.headersTimeout = 62000;

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');

    const influxDBService = require('./services/influxdb.service');
    const kafkaProducerService = require('./services/kafkaProducer.service');
    const taskSchedulerService = require('./services/taskScheduler.service');
    const redisClient = require('./utils/redis');

    Promise.all([
      influxDBService.close().catch(err => logger.error('InfluxDB close error:', err)),
      kafkaProducerService.disconnect().catch(err => logger.error('Kafka disconnect error:', err)),
      taskSchedulerService.close().catch(err => logger.error('Task scheduler close error:', err)),
      redisClient.disconnect()
    ]).then(() => {
      logger.info('All connections closed. Exiting.');
      process.exit(0);
    }).catch(err => {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    logger.error('Server error:', err);
  }
});

module.exports = server;
