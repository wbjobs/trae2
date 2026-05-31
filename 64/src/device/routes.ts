import { Router } from 'express';
import {
  registerDevice,
  heartbeat,
  getDevice,
  getAllDevices,
  getOnlineDevices,
  sendCommand,
  deleteDevice,
  getDeviceStats,
  assignTask,
  releaseTask,
} from './controller';
import { authMiddleware, adminAuth, operatorAuth, deviceAuth } from '../auth/middleware';

const router = Router();

router.post('/register', deviceAuth, registerDevice);
router.post('/heartbeat', deviceAuth, heartbeat);
router.post('/command', operatorAuth, sendCommand);
router.post('/assign-task', operatorAuth, assignTask);
router.post('/release-task', operatorAuth, releaseTask);
router.get('/stats', authMiddleware(), getDeviceStats);
router.get('/online', authMiddleware(), getOnlineDevices);
router.get('/:id', authMiddleware(), getDevice);
router.delete('/:id', adminAuth, deleteDevice);
router.get('/', authMiddleware(), getAllDevices);

export default router;
