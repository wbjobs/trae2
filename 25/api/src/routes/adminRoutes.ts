import { Router } from 'express'
import { adminController } from '../controllers/adminController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import { requireAdmin } from '../middleware/roleMiddleware.js'

const router = Router()

router.get('/users', authenticateToken, requireAdmin, adminController.getAllUsers)
router.get('/users/:userId', authenticateToken, requireAdmin, adminController.getUserById)
router.put('/users/:userId', authenticateToken, requireAdmin, adminController.updateUser)
router.delete('/users/:userId', authenticateToken, requireAdmin, adminController.deleteUser)

export default router
