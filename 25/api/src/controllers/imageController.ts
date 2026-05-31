import { type Response } from 'express'
import fs from 'fs'
import path from 'path'
import { imageService } from '../services/imageService.js'
import type { AuthRequest } from '../types/index.js'

export const imageController = {
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const images = imageService.getAll()
      res.status(200).json({ success: true, data: images })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.imageId)
      const image = imageService.getById(id)
      if (!image) {
        res.status(404).json({ success: false, error: 'Image not found' })
        return
      }
      res.status(200).json({ success: true, data: image })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getByProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projectId = Number(req.params.id)
      const images = imageService.getByProject(projectId)
      res.status(200).json({ success: true, data: images })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' })
        return
      }
      const projectId = Number(req.params.id)
      const description = req.body.description
      const image = await imageService.upload({
        projectId,
        file: req.file,
        userId: req.user.userId,
        description,
      })
      res.status(201).json({ success: true, data: image })
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
      const id = Number(req.params.imageId)
      const { description } = req.body
      const image = imageService.update(id, { description }, req.user.userId)
      if (!image) {
        res.status(404).json({ success: false, error: 'Image not found' })
        return
      }
      res.status(200).json({ success: true, data: image })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
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
      const id = Number(req.params.imageId)
      const deleted = imageService.delete(id, req.user.userId)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Image not found' })
        return
      }
      res.status(200).json({ success: true, message: 'Image deleted' })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(500).json({ success: false, error: err.message })
      }
    }
  },

  async download(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.imageId)
      const filePath = imageService.getImageFilePath(id)
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'File not found' })
        return
      }
      res.download(filePath)
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
}
