import { type Response } from 'express'
import { reviewService } from '../services/reviewService.js'
import type { AuthRequest } from '../types/index.js'

export const reviewController = {
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const reviews = reviewService.getAll()
      res.status(200).json({ success: true, data: reviews })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getByAnnotation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const annotationId = Number(req.params.annotationId)
      const reviews = reviewService.getByAnnotation(annotationId)
      res.status(200).json({ success: true, data: reviews })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getByProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projectId = Number(req.params.id)
      const reviews = reviewService.getByProject(projectId)
      res.status(200).json({ success: true, data: reviews })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.reviewId)
      const review = reviewService.getById(id)
      if (!review) {
        res.status(404).json({ success: false, error: 'Review not found' })
        return
      }
      res.status(200).json({ success: true, data: review })
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
      const annotationId = Number(req.params.annotationId)
      const { status, comment } = req.body
      const review = reviewService.create({
        annotationId,
        reviewerId: req.user.userId,
        status,
        comment,
      })
      res.status(201).json({ success: true, data: review })
    } catch (err: any) {
      if (err.message.includes('Access denied') || err.message.includes('Cannot review')) {
        res.status(403).json({ success: false, error: err.message })
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
      const id = Number(req.params.reviewId)
      const deleted = reviewService.delete(id, req.user.userId)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Review not found' })
        return
      }
      res.status(200).json({ success: true, message: 'Review deleted' })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(500).json({ success: false, error: err.message })
      }
    }
  },
}
