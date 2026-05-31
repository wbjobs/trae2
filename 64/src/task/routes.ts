import { Router } from 'express';
import {
  createTask,
  queueTask,
  getTask,
  updateTask,
  queryTasks,
  cancelTask,
  deleteTask,
  getTaskStats,
  getNextTask,
} from './controller';
import { authMiddleware, operatorAuth } from '../auth/middleware';

const router = Router();

router.post('/', operatorAuth, createTask);
router.get('/stats', authMiddleware(), getTaskStats);
router.get('/next', operatorAuth, getNextTask);
router.get('/:id', authMiddleware(), getTask);
router.put('/:id/queue', operatorAuth, queueTask);
router.put('/:id', operatorAuth, updateTask);
router.put('/:id/cancel', operatorAuth, cancelTask);
router.delete('/:id', authMiddleware(['admin:all']), deleteTask);
router.get('/', authMiddleware(), queryTasks);

export default router;
