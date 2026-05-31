import { Router } from 'express'
import { annotationController } from '../controllers/annotationController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

router.get('/', authenticateToken, annotationController.getAll)
router.get('/:annotationId', authenticateToken, annotationController.getById)
router.put('/:annotationId', authenticateToken, annotationController.update)
router.delete('/:annotationId', authenticateToken, annotationController.delete)
router.put('/:annotationId/status', authenticateToken, annotationController.setStatus)

export default router
