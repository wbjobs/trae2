import { Router } from 'express'
import { projectController } from '../controllers/projectController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

router.get('/', authenticateToken, projectController.getAll)
router.get('/mine', authenticateToken, projectController.getMyProjects)
router.get('/:id', authenticateToken, projectController.getById)
router.post('/', authenticateToken, projectController.create)
router.put('/:id', authenticateToken, projectController.update)
router.delete('/:id', authenticateToken, projectController.delete)
router.get('/:id/members', authenticateToken, projectController.getMembers)
router.post('/:id/members', authenticateToken, projectController.addMember)
router.delete('/:id/members/:userId', authenticateToken, projectController.removeMember)

export default router
