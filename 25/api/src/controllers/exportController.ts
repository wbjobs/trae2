import { type Response } from 'express'
import { exportService } from '../services/exportService.js'
import { projectRepository } from '../repositories/projectRepository.js'
import { reviewRepository } from '../repositories/reviewRepository.js'
import { annotationRepository } from '../repositories/annotationRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import type { AuthRequest } from '../types/index.js'

export const exportController = {
  async exportReviews(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const projectId = Number(req.params.projectId)
      const format = (req.query.format as string) || 'json'

      const project = projectRepository.findById(projectId)
      if (!project) {
        res.status(404).json({ success: false, error: '项目不存在' })
        return
      }

      const reviews = reviewRepository.findByProject(projectId)
      const users = userRepository.findAll()
      const userMap = new Map(users.map((u) => [u.id, u]))

      const enrichedReviews = reviews.map((review) => {
        const annotation = annotationRepository.findById(review.annotation_id)
        const reviewer = userMap.get(review.reviewer_id)
        const annotator = annotation ? userMap.get(annotation.user_id) : null

        return {
          review,
          annotation: annotation!,
          reviewer: { name: reviewer?.username || '未知', email: reviewer?.email || '' },
          annotator: { name: annotator?.username || '未知', email: annotator?.email || '' },
        }
      })

      const statistics = {
        total: reviews.length,
        approved: reviews.filter((r) => r.status === 'approved').length,
        rejected: reviews.filter((r) => r.status === 'rejected').length,
        pending: 0,
      }

      const exportData = {
        projectId,
        projectName: project.name,
        reviews: enrichedReviews,
        exportDate: new Date().toLocaleString('zh-CN'),
        statistics,
      }

      let content: string
      let contentType: string
      let filename: string

      switch (format) {
        case 'csv':
          content = exportService.toCSV(exportData)
          contentType = 'text/csv; charset=utf-8'
          filename = `勘校意见_${project.name}_${new Date().toISOString().split('T')[0]}.csv`
          break
        case 'html':
          content = exportService.toHTML(exportData)
          contentType = 'text/html; charset=utf-8'
          filename = `勘校意见_${project.name}_${new Date().toISOString().split('T')[0]}.html`
          break
        case 'md':
        case 'markdown':
          content = exportService.generateMarkdown(exportData)
          contentType = 'text/markdown; charset=utf-8'
          filename = `勘校意见_${project.name}_${new Date().toISOString().split('T')[0]}.md`
          break
        default:
          content = exportService.toJSON(exportData)
          contentType = 'application/json; charset=utf-8'
          filename = `勘校意见_${project.name}_${new Date().toISOString().split('T')[0]}.json`
      }

      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      res.status(200).send(content)
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },

  async getExportPreview(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未授权' })
        return
      }

      const projectId = Number(req.params.projectId)

      const project = projectRepository.findById(projectId)
      if (!project) {
        res.status(404).json({ success: false, error: '项目不存在' })
        return
      }

      const reviews = reviewRepository.findByProject(projectId)

      const statistics = {
        total: reviews.length,
        approved: reviews.filter((r) => r.status === 'approved').length,
        rejected: reviews.filter((r) => r.status === 'rejected').length,
        pending: 0,
      }

      res.status(200).json({
        success: true,
        data: {
          projectName: project.name,
          reviewCount: reviews.length,
          statistics,
          availableFormats: ['json', 'csv', 'html', 'md'],
        },
      })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
}
