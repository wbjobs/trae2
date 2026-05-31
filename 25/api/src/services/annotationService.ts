import { annotationRepository } from '../repositories/annotationRepository.js'
import { imageRepository } from '../repositories/imageRepository.js'
import { projectMemberRepository } from '../repositories/projectMemberRepository.js'
import type { Annotation } from '../types/index.js'

export interface CreateAnnotationInput {
  imageId: number
  userId: number
  x: number
  y: number
  width: number
  height: number
  content: string
}

export interface UpdateAnnotationInput {
  x?: number
  y?: number
  width?: number
  height?: number
  content?: string
}

export const annotationService = {
  getAll(): Annotation[] {
    return annotationRepository.findAll()
  },

  getByImage(imageId: number): Annotation[] {
    return annotationRepository.findByImage(imageId)
  },

  getById(id: number): Annotation | null {
    return annotationRepository.findById(id)
  },

  create(input: CreateAnnotationInput): Annotation {
    const { imageId, userId, x, y, width, height, content } = input

    const image = imageRepository.findById(imageId)
    if (!image) throw new Error('Image not found')

    const isMember = projectMemberRepository.isMember(userId, image.project_id)
    if (!isMember) {
      throw new Error('Access denied: not a project member')
    }

    if (!content) {
      throw new Error('Annotation content is required')
    }

    return annotationRepository.create({
      image_id: imageId,
      user_id: userId,
      x,
      y,
      width,
      height,
      content,
    })
  },

  update(id: number, input: UpdateAnnotationInput, userId: number): Annotation | null {
    const annotation = annotationRepository.findById(id)
    if (!annotation) throw new Error('Annotation not found')

    if (annotation.user_id !== userId) {
      const role = projectMemberRepository.getUserRole(userId, annotation.image_id)
      if (role !== 'admin') {
        throw new Error('Access denied: only creator or project admin can update')
      }
    }

    return annotationRepository.update(id, input)
  },

  delete(id: number, userId: number): boolean {
    const annotation = annotationRepository.findById(id)
    if (!annotation) throw new Error('Annotation not found')

    if (annotation.user_id !== userId) {
      const image = imageRepository.findById(annotation.image_id)
      if (image) {
        const role = projectMemberRepository.getUserRole(userId, image.project_id)
        if (role !== 'admin') {
          throw new Error('Access denied: only creator or project admin can delete')
        }
      } else {
        throw new Error('Access denied')
      }
    }

    return annotationRepository.delete(id)
  },

  setStatus(id: number, status: 'pending' | 'approved' | 'rejected', userId: number): Annotation | null {
    const annotation = annotationRepository.findById(id)
    if (!annotation) throw new Error('Annotation not found')

    return annotationRepository.setStatus(id, status)
  },
}
