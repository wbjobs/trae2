import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.get('/me', authenticateJWT, authController.getCurrentUser);
router.post('/change-password', authenticateJWT, authController.changePassword);
router.post('/logout', authenticateJWT, authController.logout);

export default router;
