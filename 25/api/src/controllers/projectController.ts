import { type Response } from 'express'
import { projectService } from '../services/projectService.js'
import type { AuthRequest } from '../types/index.js'

export const projectController = {
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projects = projectService.getAll()
      res.status(200).json({ success: true, data: projects })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getMyProjects(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const projects = projectService.getByUser(req.user.userId)
      res.status(200).json({ success: true, data: projects })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id)
      const userId = req.user?.userId
      const project = projectService.getById(id, userId)
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' })
        return
      }
      res.status(200).json({ success: true, data: project })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(500).json({ success: false, error: err.message })
      }
    }
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const { name, description } = req.body
      const project = projectService.create({
        name,
        description,
        userId: req.user.userId,
      })
      res.status(201).json({ success: true, data: project })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const id = Number(req.params.id)
      const { name, description } = req.body
      const project = projectService.update(id, { name, description }, req.user.userId)
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' })
        return
      }
      res.status(200).json({ success: true, data: project })
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
      const id = Number(req.params.id)
      const deleted = projectService.delete(id, req.user.userId)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Project not found' })
        return
      }
      res.status(200).json({ success: true, message: 'Project deleted' })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(500).json({ success: false, error: err.message })
      }
    }
  },

  async getMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projectId = Number(req.params.id)
      const members = projectService.getMembers(projectId)
      res.status(200).json({ success: true, data: members })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async addMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const projectId = Number(req.params.id)
      const { userId, role } = req.body
      const member = projectService.addMember({
        projectId,
        userId,
        role,
        currentUserId: req.user.userId,
      })
      res.status(201).json({ success: true, data: member })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(400).json({ success: false, error: err.message })
      }
    }
  },

  async removeMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const projectId = Number(req.params.id)
      const userId = Number(req.params.userId)
      const removed = projectService.removeMember(projectId, userId, req.user.userId)
      res.status(200).json({ success: true, data: { removed } })
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: err.message })
      } else {
        res.status(400).json({ success: false, error: err.message })
      }
    }
  },
}
