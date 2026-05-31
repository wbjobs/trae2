import { type Response } from 'express'
import bcrypt from 'bcryptjs'
import { userService } from '../services/userService.js'
import type { AuthRequest } from '../types/index.js'

export const adminController = {
  async getAllUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const users = userService.getAll()
      res.status(200).json({ success: true, data: users })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getUserById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.userId)
      const user = userService.getById(id)
      res.status(200).json({ success: true, data: user })
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message })
    }
  },

  async updateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.userId)
      const { email, role, password } = req.body

      const updateData: any = { email, role }
      if (password) {
        updateData.password_hash = await bcrypt.hash(password, 10)
      }

      const user = userService.update(id, updateData)
      res.status(200).json({ success: true, data: user })
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message })
    }
  },

  async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.userId)
      const deleted = userService.delete(id)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'User not found' })
        return
      }
      res.status(200).json({ success: true, message: 'User deleted' })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
}
