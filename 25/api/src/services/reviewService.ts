import { reviewRepository } from '../repositories/reviewRepository.js'
import { annotationRepository } from '../repositories/annotationRepository.js'
import { imageRepository } from '../repositories/imageRepository.js'
import { projectMemberRepository } from '../repositories/projectMemberRepository.js'
import type { Review } from '../types/index.js'

export interface CreateReviewInput {
  annotationId: number
  reviewerId: number
  status: 'approved' | 'rejected'
  comment?: string
}

export const reviewService = {
  getAll(): Review[] {
    return reviewRepository.findAll()
  },

  getByAnnotation(annotationId: number): Review[] {
    return reviewRepository.findByAnnotation(annotationId)
  },

  getByProject(projectId: number): Review[] {
    return reviewRepository.findByProject(projectId)
  },

  getById(id: number): Review | null {
    return reviewRepository.findById(id)
  },

  create(input: CreateReviewInput): Review {
    const { annotationId, reviewerId, status, comment } = input

    const annotation = annotationRepository.findById(annotationId)
    if (!annotation) throw new Error('Annotation not found')

    const image = imageRepository.findById(annotation.image_id)
    if (!image) throw new Error('Image not found')

    const role = projectMemberRepository.getUserRole(reviewerId, image.project_id)
    if (role !== 'reviewer' && role !== 'admin') {
      throw new Error('Access denied: only reviewers and admins can create reviews')
    }

    if (annotation.user_id === reviewerId) {
      throw new Error('Cannot review your own annotation')
    }

    annotationRepository.setStatus(annotationId, status)

    return reviewRepository.create({
      annotation_id: annotationId,
      reviewer_id: reviewerId,
      status,
      comment,
    })
  },

  delete(id: number, userId: number): boolean {
    const review = reviewRepository.findById(id)
    if (!review) throw new Error('Review not found')

    if (review.reviewer_id !== userId) {
      const annotation = annotationRepository.findById(review.annotation_id)
      if (annotation) {
        const image = imageRepository.findById(annotation.image_id)
        if (image) {
          const role = projectMemberRepository.getUserRole(userId, image.project_id)
          if (role !== 'admin') {
            throw new Error('Access denied: only creator or project admin can delete')
          }
        }
      }
    }

    return reviewRepository.delete(id)
  },
}
