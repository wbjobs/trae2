import express from 'express';
import {
  createFossil,
  getAllFossils,
  getFossil,
  getFossilBySpecimenNo,
  updateFossil,
  deleteFossil,
  getFossilStats,
  searchSuggestions,
  advancedSearch
} from './fossil.controller';
import {
  createSharing,
  getSharings,
  getSharingByCode,
  updateSharingStatus,
  deleteSharing,
  getMuseums,
  createMuseum
} from './sharing.controller';
import { protect, restrictTo } from '../auth/auth.middleware';

const router = express.Router();

router.get('/', getAllFossils);
router.get('/stats', getFossilStats);
router.get('/search/suggestions', searchSuggestions);
router.post('/search/advanced', advancedSearch);
router.get('/specimen/:specimenNo', getFossilBySpecimenNo);
router.get('/:id', getFossil);

router.get('/museums/list', getMuseums);
router.post('/sharing/code/:shareCode', getSharingByCode);

router.use(protect);

router.post('/', restrictTo('admin', 'curator'), createFossil);
router.patch('/:id', restrictTo('admin', 'curator'), updateFossil);
router.delete('/:id', restrictTo('admin'), deleteFossil);

router.post('/museums', restrictTo('admin'), createMuseum);

router.post('/sharing', restrictTo('admin', 'curator'), createSharing);
router.get('/sharing/list', getSharings);
router.patch('/sharing/:id/status', restrictTo('admin', 'curator'), updateSharingStatus);
router.delete('/sharing/:id', restrictTo('admin', 'curator'), deleteSharing);

export default router;
