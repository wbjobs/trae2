import express from 'express';
import { sharingController } from '../controllers/sharing.controller';
import { authenticate, requireRoles } from '../middleware/auth.middleware';
import { UserRole } from '../models/User.model';

const router = express.Router();

router.post('/', authenticate, sharingController.createSharing);
router.get('/specimen/:specimenId', authenticate, sharingController.getSharingsBySpecimen);
router.get('/my', authenticate, sharingController.getMySharedSpecimens);
router.get('/shared-with-me', authenticate, sharingController.getSharedWithMe);
router.put('/:id', authenticate, sharingController.updateSharing);
router.delete('/:id', authenticate, sharingController.deleteSharing);
router.get('/check/:specimenId', authenticate, sharingController.checkSharingPermission);

export default router;
