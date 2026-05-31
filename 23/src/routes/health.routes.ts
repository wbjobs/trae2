import { Router, Request, Response } from 'express';
import os from 'os';
import process from 'process';

const router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    pid: process.pid,
    workerId: process.env.WORKER_ID || 'master',
    memory: process.memoryUsage(),
    cpu: {
      cores: os.cpus().length,
      loadavg: os.loadavg(),
    },
  });
});

router.get('/ready', (_req: Request, res: Response): void => {
  res.json({
    ready: true,
    timestamp: Date.now(),
  });
});

export default router;
