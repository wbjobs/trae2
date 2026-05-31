import { Router } from 'express'
import { reviewController } from '../controllers/reviewController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

router.get('/', authenticateToken, reviewController.getAll)
router.get('/:reviewId', authenticateToken, reviewController.getById)
router.delete('/:reviewId', authenticateToken, reviewController.delete)

export default router
