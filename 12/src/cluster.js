const cluster = require('cluster');
const os = require('os');
const config = require('./config');
const logger = require('./utils/logger');
const createApp = require('./app');

const numCPUs = os.cpus().length;
const numWorkers = Math.min(config.clusterInstances || 4, numCPUs);

if (cluster.isPrimary) {
  logger.info(`主进程启动，PID: ${process.pid}`);
  logger.info(`CPU核心数: ${numCPUs}, 启动工作进程数: ${numWorkers}`);

  console.log(`🌐 启动API集群服务集群模式`);
  console.log(`👑 主进程 PID: ${process.pid}`);
  console.log(`🔢 工作进程数: ${numWorkers}`);
  console.log(`🚀 正在启动工作进程...`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork({ INSTANCE_ID: i });
  }

  cluster.on('online', (worker) => {
    logger.info(`工作进程 ${worker.process.pid} 已启动`);
    console.log(`✅ 工作进程 ${worker.process.pid} 已启动`);
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`工作进程 ${worker.process.pid} 已退出，退出码: ${code}, 信号: ${signal}`);
    console.log(`⚠️  工作进程 ${worker.process.pid} 已退出`);

    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info(`正在重新启动工作进程...`);
      console.log(`🔄 正在重新启动工作进程...`);
      cluster.fork({ INSTANCE_ID: worker.id });
    }
  });

  process.on('SIGTERM', () => {
    logger.info('收到SIGTERM信号，正在关闭集群...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('收到SIGINT信号，正在关闭集群...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    process.exit(0);
  });

} else {
  const instanceId = process.env.INSTANCE_ID || 'unknown';

  logger.info(`工作进程启动，PID: ${process.pid}, 实例ID: ${instanceId}`);

  (async () => {
    try {
      const app = await createApp();

      const server = app.listen(config.port, () => {
        logger.info(`工作进程 ${process.pid} 监听端口 ${config.port}`);
        console.log(`🚀 工作进程 ${process.pid} 已启动，监听 http://localhost:${config.port} (实例 ${instanceId})`);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`端口 ${config.port} 已被占用`);
          process.exit(1);
        }
      });

      process.on('SIGTERM', () => {
        server.close(() => {
          logger.info(`工作进程 ${process.pid} 已关闭`);
          process.exit(0);
        });
      });
    } catch (error) {
      logger.error(`工作进程启动失败: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = cluster;
