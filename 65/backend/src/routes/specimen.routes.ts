import { Router } from 'express';
import { specimenController } from '../controllers/specimen.controller';
import { authenticateJWT, requireCuratorOrAdmin, requireResearcherOrHigher } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, specimenController.getAllSpecimens);
router.get('/categories', authenticateJWT, specimenController.getCategories);
router.get('/stats', authenticateJWT, specimenController.getStats);
router.get('/:id', authenticateJWT, specimenController.getSpecimenById);
router.post('/', authenticateJWT, requireCuratorOrAdmin, specimenController.createSpecimen);
router.put('/:id', authenticateJWT, requireCuratorOrAdmin, specimenController.updateSpecimen);
router.delete('/:id', authenticateJWT, requireAdmin, specimenController.deleteSpecimen);
router.patch('/:id/verify', authenticateJWT, requireCuratorOrAdmin, specimenController.verifySpecimen);

export default router;
