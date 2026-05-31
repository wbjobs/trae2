const cluster = require('cluster');
const os = require('os');
const { config } = require('./config');
const logger = require('./utils/logger');

const numCPUs = os.cpus().length;
const numWorkers = Math.min(config.cluster.workers || numCPUs, numCPUs * 2);
const maxMemoryPerWorker = 512;

if (cluster.isMaster) {
  logger.info(`=== Pipeline Corrosion Monitoring Cluster ===`);
  logger.info(`Master process ${process.pid} is running`);
  logger.info(`CPU cores available: ${numCPUs}`);
  logger.info(`Total memory: ${Math.round(os.totalmem() / 1024 / 1024)}MB`);
  logger.info(`Starting ${numWorkers} worker processes (max ${maxMemoryPerWorker}MB each)...`);

  const workerPool = new Map();
  const workerLoad = new Map();

  for (let i = 0; i < numWorkers; i++) {
    const workerId = `worker-${i + 1}`;
    const worker = cluster.fork({
      WORKER_ID: workerId,
      NODE_OPTIONS: `--max-old-space-size=${maxMemoryPerWorker}`
    });

    workerPool.set(worker.process.pid, { worker, workerId, load: 0 });
    workerLoad.set(worker.process.pid, 0);

    logger.info(`Worker ${worker.process.pid} (${workerId}) started with ${maxMemoryPerWorker}MB memory limit`);
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);

    const workerInfo = workerPool.get(worker.process.pid);
    const workerId = workerInfo?.workerId || `worker-${Date.now()}`;

    const restartDelay = code !== 0 ? 5000 : 1000;
    logger.info(`Restarting worker ${workerId} after ${restartDelay}ms...`);

    setTimeout(() => {
      const newWorker = cluster.fork({
        WORKER_ID: workerId,
        NODE_OPTIONS: `--max-old-space-size=${maxMemoryPerWorker}`
      });

      workerPool.set(newWorker.process.pid, { worker: newWorker, workerId, load: 0 });
      workerLoad.set(newWorker.process.pid, 0);

      logger.info(`New worker ${newWorker.process.pid} (${workerId}) started`);
    }, restartDelay);
  });

  cluster.on('online', (worker) => {
    logger.debug(`Worker ${worker.process.pid} is online`);
  });

  cluster.on('disconnect', (worker) => {
    logger.warn(`Worker ${worker.process.pid} disconnected`);
  });

  cluster.on('message', (worker, message) => {
    if (message.type === 'loadUpdate') {
      workerLoad.set(worker.process.pid, message.load);
    }
  });

  const monitorCluster = () => {
    const workerCount = Object.keys(cluster.workers).length;
    const totalLoad = Array.from(workerLoad.values()).reduce((a, b) => a + b, 0);
    const avgLoad = workerCount > 0 ? totalLoad / workerCount : 0;

    const freeMemory = Math.round(os.freemem() / 1024 / 1024);
    const usedMemory = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
    const memoryUsagePercent = Math.round((usedMemory / os.totalmem()) * 100);

    logger.info(`Cluster status: ${workerCount}/${numWorkers} workers, avg load: ${avgLoad.toFixed(2)}, memory: ${memoryUsagePercent}%`);

    if (workerCount < numWorkers && memoryUsagePercent < 80) {
      logger.warn(`Worker count below expected. Current: ${workerCount}, Expected: ${numWorkers}`);
      const needed = numWorkers - workerCount;
      for (let i = 0; i < needed; i++) {
        const workerId = `worker-${workerCount + i + 1}`;
        const worker = cluster.fork({
          WORKER_ID: workerId,
          NODE_OPTIONS: `--max-old-space-size=${maxMemoryPerWorker}`
        });
        workerPool.set(worker.process.pid, { worker, workerId, load: 0 });
        logger.info(`Scaling up: Worker ${worker.process.pid} (${workerId}) started`);
      }
    }
  };

  setInterval(monitorCluster, 30000);

  process.on('SIGTERM', () => {
    logger.info('Master received SIGTERM. Shutting down cluster...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 10000);
  });

  process.on('SIGINT', () => {
    logger.info('Master received SIGINT. Shutting down cluster...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGINT');
    }
    setTimeout(() => process.exit(0), 10000);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Master uncaught exception:', err);
  });

} else {
  const workerId = process.env.WORKER_ID || 'unknown';
  logger.info(`Worker process ${process.pid} (${workerId}) started`);

  process.on('uncaughtException', (err) => {
    logger.error(`Worker ${workerId} uncaught exception:`, err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Worker ${workerId} unhandled rejection:`, reason);
  });

  const reportLoad = () => {
    const load = process.memoryUsage();
    process.send({
      type: 'loadUpdate',
      load: Math.round((load.heapUsed / 1024 / 1024 / maxMemoryPerWorker) * 100)
    });
  };

  setInterval(reportLoad, 5000);

  require('./server');
}
