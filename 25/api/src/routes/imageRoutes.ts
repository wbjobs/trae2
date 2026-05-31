import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { imageController } from '../controllers/imageController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import config from '../config/index.js'

const uploadDir = path.join(config.storage.uploadDir, 'temp')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.storage.maxFileSize,
  },
})

const router = Router()

router.get('/', authenticateToken, imageController.getAll)
router.get('/:imageId', authenticateToken, imageController.getById)
router.get('/:imageId/download', authenticateToken, imageController.download)
router.put('/:imageId', authenticateToken, imageController.update)
router.delete('/:imageId', authenticateToken, imageController.delete)

export { upload }
export default router
