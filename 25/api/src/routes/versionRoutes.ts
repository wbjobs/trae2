import { Router } from 'express'
import { versionController } from '../controllers/versionController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import { upload } from './imageRoutes.js'

const router = Router()

router.get('/', authenticateToken, versionController.getByImage)
router.post('/', authenticateToken, upload.single('file'), versionController.create)
router.delete('/:versionId', authenticateToken, versionController.delete)

export default router
