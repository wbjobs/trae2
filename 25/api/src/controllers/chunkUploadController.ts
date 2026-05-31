import { type Response } from 'express'
import { chunkUploadService } from '../services/chunkUploadService.js'
import type { AuthRequest } from '../types/index.js'

export const chunkUploadController = {
  async initiate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const { fileName, fileSize, chunkSize } = req.body

      if (!fileName || !fileSize) {
        res.status(400).json({
          success: false,
          error: 'fileName 和 fileSize 都是必填字段',
        })
        return
      }

      const result = await chunkUploadService.initiateUpload(
        fileName,
        fileSize,
        chunkSize
      )

      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async uploadChunk(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const uploadId = req.params.uploadId
      const chunkNumber = Number(req.params.chunkNumber)

      if (isNaN(chunkNumber)) {
        res.status(400).json({ success: false, error: '分片编号无效' })
        return
      }

      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const chunkData = Buffer.concat(chunks)

      const result = await chunkUploadService.uploadChunk(
        uploadId,
        chunkNumber,
        chunkData
      )

      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async getStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const uploadId = req.params.uploadId
      const result = chunkUploadService.getUploadStatus(uploadId)

      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async getMissingChunks(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const uploadId = req.params.uploadId
      const missing = chunkUploadService.getMissingChunks(uploadId)

      res.status(200).json({ success: true, data: { missing } })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const uploadId = req.params.uploadId
      chunkUploadService.cancelUpload(uploadId)

      res.status(200).json({ success: true, message: '上传已取消' })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },
}
