import { Router } from 'express';
import { TerminalController } from '../controllers/terminal.controller';
import { AdminController } from '../controllers/admin.controller';
import { terminalLockMiddleware, adminLockMiddleware } from '../middleware/lock.middleware';
import { createTerminalRateLimitMiddleware, createRateLimitMiddleware } from '../services/rate-limiter.service';

const router = Router();
const terminalController = new TerminalController();
const adminController = new AdminController();

router.post(
  '/terminal/report',
  createTerminalRateLimitMiddleware(),
  terminalLockMiddleware,
  (req, res) => terminalController.reportData(req, res)
);

router.get(
  '/terminal/status/:terminalId',
  createRateLimitMiddleware('query'),
  (req, res) => terminalController.getStatus(req, res)
);

router.get(
  '/terminal/history/:terminalId',
  createRateLimitMiddleware('query'),
  (req, res) => terminalController.getHistory(req, res)
);

router.get(
  '/terminal/alarms/:terminalId',
  createRateLimitMiddleware('query'),
  (req, res) => terminalController.getAlarms(req, res)
);

router.get(
  '/admin/terminals',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => terminalController.listTerminals(req, res)
);

router.get(
  '/admin/metrics',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getMetrics(req, res)
);

router.post(
  '/admin/rules',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.addRule(req, res)
);

router.delete(
  '/admin/rules/:ruleId',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.removeRule(req, res)
);

router.get(
  '/admin/rules',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.listRules(req, res)
);

router.get(
  '/admin/alarms',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.listAlarms(req, res)
);

router.get(
  '/admin/queue/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getQueueStats(req, res)
);

router.post(
  '/admin/queue/retry-dlq',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.retryDLQ(req, res)
);

router.get(
  '/admin/thresholds',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getThresholdConfig(req, res)
);

router.post(
  '/admin/thresholds/:metricName',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.updateThresholdConfig(req, res)
);

router.get(
  '/admin/lock/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getLockStats(req, res)
);

router.get(
  '/admin/rate-limit/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getRateLimitStats(req, res)
);

router.get(
  '/admin/pipeline/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getPipelineStats(req, res)
);

router.post(
  '/admin/pipeline/handler/:name/toggle',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.togglePipelineHandler(req, res)
);

router.get(
  '/admin/liveness/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getLivenessStats(req, res)
);

router.get(
  '/admin/batch/stats',
  createRateLimitMiddleware('admin'),
  adminLockMiddleware,
  (req, res) => adminController.getBatchStats(req, res)
);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: Date.now(),
    pid: process.pid,
  });
});

export default router;
