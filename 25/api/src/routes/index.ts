import { Router } from 'express'
import authRoutes from './authRoutes.js'
import projectRoutes from './projectRoutes.js'
import imageRoutes from './imageRoutes.js'
import annotationRoutes from './annotationRoutes.js'
import reviewRoutes from './reviewRoutes.js'
import versionRoutes from './versionRoutes.js'
import adminRoutes from './adminRoutes.js'
import { imageController } from '../controllers/imageController.js'
import { annotationController } from '../controllers/annotationController.js'
import { reviewController } from '../controllers/reviewController.js'
import { versionController } from '../controllers/versionController.js'
import { textComparisonController } from '../controllers/textComparisonController.js'
import { exportController } from '../controllers/exportController.js'
import { chunkUploadController } from '../controllers/chunkUploadController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import { upload } from './imageRoutes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/projects', projectRoutes)

router.use('/images', imageRoutes)
router.post('/projects/:id/images', authenticateToken, upload.single('file'), imageController.upload)
router.get('/projects/:id/images', authenticateToken, imageController.getByProject)

router.use('/images/:imageId/annotations', authenticateToken, (() => {
  const r = Router()
  r.get('/', annotationController.getByImage)
  r.post('/', annotationController.create)
  return r
})())

router.use('/annotations', annotationRoutes)
router.post('/annotations/:annotationId/reviews', authenticateToken, reviewController.create)
router.get('/annotations/:annotationId/reviews', authenticateToken, reviewController.getByAnnotation)

router.use('/reviews', reviewRoutes)
router.get('/projects/:id/reviews', authenticateToken, reviewController.getByProject)

router.use('/images/:imageId/versions', versionRoutes)
router.get('/images/:imageId/versions/:v1/diff/:v2', authenticateToken, versionController.getDiff)

router.post('/text-compare', authenticateToken, textComparisonController.compare)
router.post('/text-compare/batch', authenticateToken, textComparisonController.batchCompare)
router.post('/text-compare/best-match', authenticateToken, textComparisonController.findBestMatch)

router.get('/projects/:id/export/preview', authenticateToken, exportController.getExportPreview)
router.get('/projects/:id/export', authenticateToken, exportController.exportReviews)

router.post('/upload/chunk/init', authenticateToken, chunkUploadController.initiate)
router.post('/upload/chunk/:uploadId/:chunkNumber', authenticateToken, chunkUploadController.uploadChunk)
router.get('/upload/chunk/:uploadId/status', authenticateToken, chunkUploadController.getStatus)
router.get('/upload/chunk/:uploadId/missing', authenticateToken, chunkUploadController.getMissingChunks)
router.delete('/upload/chunk/:uploadId', authenticateToken, chunkUploadController.cancel)

router.use('/admin', adminRoutes)

export default router
