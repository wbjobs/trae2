import express from 'express';
import {
  uploadModel,
  getModelFile,
  getModelUrl,
  deleteModel,
  upload,
  initChunkUpload,
  uploadChunk,
  getChunkUploadStatus,
  completeChunkUpload,
  cancelChunkUpload
} from './storage.controller';
import { protect, restrictTo } from '../auth/auth.middleware';

const router = express.Router();

router.get('/file/:fileId', getModelFile);
router.get('/url/:fileId', getModelUrl);

router.use(protect);

router.post('/upload', restrictTo('admin', 'curator'), upload.single('model'), uploadModel);
router.delete('/:fileId', restrictTo('admin', 'curator'), deleteModel);

router.post('/chunk/init', restrictTo('admin', 'curator'), initChunkUpload);
router.post('/chunk/upload', restrictTo('admin', 'curator'), upload.single('chunk'), uploadChunk);
router.get('/chunk/status/:uploadId', getChunkUploadStatus);
router.post('/chunk/complete/:uploadId', restrictTo('admin', 'curator'), completeChunkUpload);
router.delete('/chunk/cancel/:uploadId', restrictTo('admin', 'curator'), cancelChunkUpload);

export default router;
