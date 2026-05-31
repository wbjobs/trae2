import { Router } from 'express';
import {
  createSubscription,
  getSubscription,
  deleteSubscription,
  getAllSubscriptions,
  triggerTestEvent,
  processQueue,
  retryFailed,
} from './controller';
import { authMiddleware, adminAuth } from '../auth/middleware';

const router = Router();

router.post('/subscribe', authMiddleware(), createSubscription);
router.get('/subscriptions', authMiddleware(), getAllSubscriptions);
router.get('/subscriptions/:id', authMiddleware(), getSubscription);
router.delete('/subscriptions/:id', authMiddleware(), deleteSubscription);
router.post('/test-event', adminAuth, triggerTestEvent);
router.post('/process-queue', adminAuth, processQueue);
router.post('/retry-failed', adminAuth, retryFailed);

export default router;
