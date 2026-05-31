import { type Response } from 'express'
import { textComparisonService } from '../services/textComparisonService.js'
import type { AuthRequest } from '../types/index.js'

export const textComparisonController = {
  async compare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { text1, text2 } = req.body

      if (!text1 || !text2) {
        res.status(400).json({
          success: false,
          error: 'text1 和 text2 都是必填字段',
        })
        return
      }

      const result = textComparisonService.compare(text1, text2)
      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async batchCompare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { pairs } = req.body

      if (!Array.isArray(pairs) || pairs.length === 0) {
        res.status(400).json({
          success: false,
          error: 'pairs 必须是非空数组',
        })
        return
      }

      const result = textComparisonService.batchCompare(pairs)
      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async findBestMatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { target, candidates } = req.body

      if (!target || !Array.isArray(candidates)) {
        res.status(400).json({
          success: false,
          error: 'target 和 candidates 都是必填字段',
        })
        return
      }

      const result = textComparisonService.findBestMatch(target, candidates)
      res.status(200).json({ success: true, data: result })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
}
