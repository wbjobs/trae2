import { Router } from 'express';
import { login, validateToken } from './controller';
import { authMiddleware } from './middleware';

const router = Router();

router.post('/login', login);
router.get('/validate', authMiddleware(), validateToken);

export default router;
