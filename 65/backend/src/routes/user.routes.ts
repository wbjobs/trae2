import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, requireAdmin, userController.getAllUsers);
router.get('/:id', authenticateJWT, requireAdmin, userController.getUserById);
router.post('/', authenticateJWT, requireAdmin, userController.createUser);
router.put('/:id', authenticateJWT, requireAdmin, userController.updateUser);
router.delete('/:id', authenticateJWT, requireAdmin, userController.deleteUser);
router.patch('/:id/role', authenticateJWT, requireAdmin, userController.updateUserRole);

export default router;
