import { Router } from 'express';
import { traceabilityController } from '../controllers/traceability.controller';
import { authenticateJWT, requireCuratorOrAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, traceabilityController.getAllTraceRecords);
router.get('/types', authenticateJWT, traceabilityController.getTraceTypes);
router.get('/specimen/:specimenId', authenticateJWT, traceabilityController.getTraceRecordsBySpecimenId);
router.get('/specimen/:specimenId/map', authenticateJWT, traceabilityController.getTraceMapData);
router.get('/:id', authenticateJWT, traceabilityController.getTraceRecordById);
router.post('/', authenticateJWT, requireCuratorOrAdmin, traceabilityController.createTraceRecord);
router.put('/:id', authenticateJWT, requireCuratorOrAdmin, traceabilityController.updateTraceRecord);
router.delete('/:id', authenticateJWT, requireCuratorOrAdmin, traceabilityController.deleteTraceRecord);

export default router;
