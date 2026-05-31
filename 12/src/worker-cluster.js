const cluster = require('cluster');
const os = require('os');
const config = require('./config');
const logger = require('./utils/logger');

const numCPUs = os.cpus().length;
const numWorkers = Math.min(config.queue.concurrency || 4, numCPUs);

if (cluster.isPrimary) {
  logger.info(`Worker主进程启动，PID: ${process.pid}`);
  logger.info(`CPU核心数: ${numCPUs}, 启动Worker数: ${numWorkers}`);

  console.log(`🔧 启动Worker集群`);
  console.log(`👑 Worker主进程 PID: ${process.pid}`);
  console.log(`🔢 Worker进程数: ${numWorkers}`);
  console.log(`🚀 正在启动Worker进程...`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork({ WORKER_ID: i });
  }

  cluster.on('online', (worker) => {
    logger.info(`Worker进程 ${worker.process.pid} 已启动`);
    console.log(`✅ Worker进程 ${worker.process.pid} 已启动`);
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker进程 ${worker.process.pid} 已退出，退出码: ${code}, 信号: ${signal}`);
    console.log(`⚠️  Worker进程 ${worker.process.pid} 已退出`);

    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info(`正在重新启动Worker进程...`);
      console.log(`🔄 正在重新启动Worker进程...`);
      cluster.fork({ WORKER_ID: worker.id });
    }
  });

  process.on('SIGTERM', () => {
    logger.info('收到SIGTERM信号，正在关闭Worker集群...`);
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('收到SIGINT信号，正在关闭Worker集群...`);
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    process.exit(0);
  });

} else {
  require('./worker');
}

module.exports = cluster;
