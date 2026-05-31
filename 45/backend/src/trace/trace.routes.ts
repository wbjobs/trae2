import express from 'express';
import {
  addTraceRecord,
  getFossilTraces,
  getTraceBySpecimenNo,
  getAllTraces,
  getTraceStats,
  getTrace
} from './trace.controller';
import { protect, restrictTo } from '../auth/auth.middleware';

const router = express.Router();

router.get('/', getAllTraces);
router.get('/fossil/:fossilId', getFossilTraces);
router.get('/specimen/:specimenNo', getTraceBySpecimenNo);
router.get('/fossil/:fossilId/stats', getTraceStats);
router.get('/:id', getTrace);

router.use(protect);

router.post('/', restrictTo('admin', 'curator'), addTraceRecord);

export default router;
