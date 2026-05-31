import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { authenticateJWT, requireCuratorOrAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/specimen/:specimenId', authenticateJWT, imageController.getImagesBySpecimenId);
router.get('/:id', authenticateJWT, imageController.getImageById);
router.get('/:id/presigned-url', authenticateJWT, imageController.getPresignedUrl);
router.post('/', authenticateJWT, requireCuratorOrAdmin, imageController.uploadMiddleware, imageController.uploadImages);
router.put('/:id', authenticateJWT, requireCuratorOrAdmin, imageController.updateImage);
router.patch('/:id/primary', authenticateJWT, requireCuratorOrAdmin, imageController.setPrimaryImage);
router.delete('/:id', authenticateJWT, requireCuratorOrAdmin, imageController.deleteImage);

export default router;
