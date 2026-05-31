import cluster from 'cluster';
import os from 'os';
import { config } from './config/environment';
import logger from './utils/logger';

const numCPUs = os.cpus().length;
const numWorkers = config.server.clusterWorkers || numCPUs;

if (cluster.isPrimary) {
  logger.info(`Primary process started`, {
    pid: process.pid,
    numWorkers,
    totalCPUs: numCPUs,
  });

  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork({ WORKER_ID: `worker-${i + 1}` });
    logger.info(`Worker ${i + 1} started`, { workerPid: worker.process.pid });
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn('Worker process exited:', {
      workerId: (worker.process as unknown as { env: NodeJS.ProcessEnv }).env.WORKER_ID,
      pid: worker.process.pid,
      exitCode: code,
      signal,
    });

    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info('Restarting worker...');
      const newWorker = cluster.fork({
        WORKER_ID: (worker.process as unknown as { env: NodeJS.ProcessEnv }).env.WORKER_ID,
      });
      logger.info('New worker started:', {
        workerId: (newWorker.process as unknown as { env: NodeJS.ProcessEnv }).env.WORKER_ID,
        pid: newWorker.process.pid,
      });
    }
  });

  cluster.on('online', (worker) => {
    logger.info('Worker is online:', {
      workerId: (worker.process as unknown as { env: NodeJS.ProcessEnv }).env.WORKER_ID,
      pid: worker.process.pid,
    });
  });

  cluster.on('listening', (worker, address) => {
    logger.info('Worker is listening:', {
      workerId: (worker.process as unknown as { env: NodeJS.ProcessEnv }).env.WORKER_ID,
      pid: worker.process.pid,
      address: `${address.address}:${address.port}`,
    });
  });

  const gracefulShutdown = (signal: string): void => {
    logger.info(`Primary received ${signal}, shutting down cluster...`);

    const workers = Object.values(cluster.workers || {});
    workers.forEach((worker) => {
      if (worker) {
        worker.send('shutdown');
        worker.disconnect();
      }
    });

    setTimeout(() => {
      logger.info('All workers should be stopped now');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
} else {
  require('./server');

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      logger.info('Worker received shutdown signal, stopping...');
      process.exit(0);
    }
  });
}
