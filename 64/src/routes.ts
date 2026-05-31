import { Router } from 'express';
import authRoutes from './auth/routes';
import radarDataRoutes from './radarData/routes';
import taskRoutes from './task/routes';
import deviceRoutes from './device/routes';
import callbackRoutes from './callback/routes';
import { success } from './utils/response';

const router = Router();

router.get('/health', (_req, res) => {
  success(res, {
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

router.use('/auth', authRoutes);
router.use('/radar-data', radarDataRoutes);
router.use('/tasks', taskRoutes);
router.use('/devices', deviceRoutes);
router.use('/callbacks', callbackRoutes);

export default router;
