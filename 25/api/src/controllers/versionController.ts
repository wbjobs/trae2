import { type Response } from 'express'
import { versionService } from '../services/versionService.js'
import type { AuthRequest } from '../types/index.js'

export const versionController = {
  async getByImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const imageId = Number(req.params.imageId)
      const versions = versionService.getByImage(imageId)
      res.status(200).json({ success: true, data: versions })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getByImageAndVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const imageId = Number(req.params.imageId)
      const versionNumber = Number(req.params.versionNumber)
      const version = versionService.getByImageAndVersion(imageId, versionNumber)
      if (!version) {
        res.status(404).json({ success: false, error: 'Version not found' })
        return
      }
      res.status(200).json({ success: true, data: version })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' })
        return
      }
      const imageId = Number(req.params.imageId)
      const description = req.body.description
      const version = await versionService.createVersion({
        imageId,
        file: req.file,
        userId: req.user.userId,
        description,
      })
      res.status(201).json({ success: true, data: version })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(400).json({ success: false, error: err.message })
      }
    }
  },

  async getDiff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const imageId = Number(req.params.imageId)
      const v1 = Number(req.params.v1)
      const v2 = Number(req.params.v2)
      const diff = versionService.getVersionDiff(imageId, v1, v2)
      res.status(200).json({ success: true, data: diff })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const id = Number(req.params.versionId)
      const deleted = versionService.delete(id, req.user.userId)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Version not found' })
        return
      }
      res.status(200).json({ success: true, message: 'Version deleted' })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
}
