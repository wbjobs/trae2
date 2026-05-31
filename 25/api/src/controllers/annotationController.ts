import { type Response } from 'express'
import { annotationService } from '../services/annotationService.js'
import type { AuthRequest } from '../types/index.js'

export const annotationController = {
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const annotations = annotationService.getAll()
      res.status(200).json({ success: true, data: annotations })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getByImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const imageId = Number(req.params.imageId)
      const annotations = annotationService.getByImage(imageId)
      res.status(200).json({ success: true, data: annotations })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.annotationId)
      const annotation = annotationService.getById(id)
      if (!annotation) {
        res.status(404).json({ success: false, error: 'Annotation not found' })
        return
      }
      res.status(200).json({ success: true, data: annotation })
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
      const imageId = Number(req.params.imageId)
      const { x, y, width, height, content } = req.body
      const annotation = annotationService.create({
        imageId,
        userId: req.user.userId,
        x,
        y,
        width,
        height,
        content,
      })
      res.status(201).json({ success: true, data: annotation })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(400).json({ success: false, error: err.message })
      }
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const id = Number(req.params.annotationId)
      const { x, y, width, height, content } = req.body
      const annotation = annotationService.update(id, { x, y, width, height, content }, req.user.userId)
      if (!annotation) {
        res.status(404).json({ success: false, error: 'Annotation not found' })
        return
      }
      res.status(200).json({ success: true, data: annotation })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else if (err.message.includes('not found')) {
        res.status(404).json({ success: false, error: err.message })
      } else {
        res.status(400).json({ success: false, error: err.message })
      }
    }
  },

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const id = Number(req.params.annotationId)
      const deleted = annotationService.delete(id, req.user.userId)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Annotation not found' })
        return
      }
      res.status(200).json({ success: true, message: 'Annotation deleted' })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(500).json({ success: false, error: err.message })
      }
    }
  },

  async setStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const id = Number(req.params.annotationId)
      const { status } = req.body
      const annotation = annotationService.setStatus(id, status, req.user.userId)
      if (!annotation) {
        res.status(404).json({ success: false, error: 'Annotation not found' })
        return
      }
      res.status(200).json({ success: true, data: annotation })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },
}
