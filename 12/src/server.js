const createApp = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

let server;

(async () => {
  try {
    const app = await createApp();

    server = app.listen(config.port, () => {
      logger.info(`API服务启动成功`, {
        port: config.port,
        nodeEnv: config.nodeEnv,
        pid: process.pid
      });
      console.log(`🚀 工业设备API服务已启动: http://localhost:${config.port}`);
      console.log(`📊 健康检查: http://localhost:${config.port}/api/admin/health`);
      console.log(`ℹ️  系统信息: http://localhost:${config.port}/api/admin/info`);
      console.log(`🔔 告警管理: http://localhost:${config.port}/api/alerts/stats`);
    });

    const shutdown = async (signal) => {
      logger.info(`收到${signal}信号，正在优雅关闭服务...`);

      server.close(() => {
        logger.info('HTTP服务器已关闭');
      });

      try {
        const queueService = require('./queue');
        await queueService.close();

        const databaseService = require('./database/influxdb');
        await databaseService.close();

        const alertEngine = require('./alerting/engine');
        await alertEngine.close();

        logger.info('所有资源已释放，服务正常关闭');
        process.exit(0);
      } catch (error) {
        logger.error('服务关闭时发生错误:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`端口 ${config.port} 已被占用`);
        process.exit(1);
      } else {
        logger.error(`服务器错误: ${error.message}`);
      }
    });

  } catch (error) {
    logger.error(`服务启动失败: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
})();

module.exports = { getServer: () => server };
