import { type Request, type Response } from 'express'
import { authService } from '../services/authService.js'
import type { AuthRequest } from '../types/index.js'

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, password, email } = req.body
      const result = await authService.register({ username, password, email })
      res.status(201).json({ success: true, data: result })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body
      const result = await authService.login({ username, password })
      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(401).json({ success: false, error: err.message })
    }
  },

  me(req: AuthRequest, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' })
        return
      }
      const user = authService.me(req.user.userId)
      res.status(200).json({ success: true, data: user })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },
}
