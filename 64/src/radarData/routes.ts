import { Router } from 'express';
import { uploadData, getData, queryData, getLatestData, deleteData, getDataStats } from './controller';
import { authMiddleware, deviceAuth } from '../auth/middleware';

const router = Router();

router.post('/', deviceAuth, uploadData);
router.get('/stats', authMiddleware(), getDataStats);
router.get('/latest/:radarId', authMiddleware(), getLatestData);
router.get('/:id', authMiddleware(), getData);
router.get('/', authMiddleware(), queryData);
router.delete('/:id', authMiddleware(['admin:all']), deleteData);

export default router;
