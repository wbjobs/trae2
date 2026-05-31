import express from 'express';
import multer from 'multer';
import { uploadController } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

router.post('/chunk/init', authenticate, uploadController.initChunkUpload);
router.post('/chunk', authenticate, upload.single('chunk'), uploadController.uploadChunk);
router.get('/chunk/check', authenticate, uploadController.checkChunk);
router.post('/chunk/complete', authenticate, uploadController.completeChunkUpload);
router.delete('/chunk/:fileId', authenticate, uploadController.abortChunkUpload);
router.patch('/image/:id/tags', authenticate, uploadController.updateImageTags);

export default router;
