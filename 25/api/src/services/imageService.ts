import fs from 'fs'
import path from 'path'
import { imageRepository } from '../repositories/imageRepository.js'
import { projectMemberRepository } from '../repositories/projectMemberRepository.js'
import { projectRepository } from '../repositories/projectRepository.js'
import type { RubbingImage } from '../types/index.js'
import config from '../config/index.js'
import { storageService } from './storageService.js'

export interface UploadImageInput {
  projectId: number
  file: Express.Multer.File
  userId: number
  description?: string
}

export interface UpdateImageInput {
  description?: string
}

export const imageService = {
  getAll(): RubbingImage[] {
    return imageRepository.findAll()
  },

  getByProject(projectId: number): RubbingImage[] {
    return imageRepository.findByProject(projectId)
  },

  getById(id: number): RubbingImage | null {
    return imageRepository.findById(id)
  },

  async upload(input: UploadImageInput): Promise<RubbingImage> {
    const { projectId, file, userId, description } = input

    const project = projectRepository.findById(projectId)
    if (!project) throw new Error('Project not found')

    const isMember = projectMemberRepository.isMember(userId, projectId)
    if (!isMember && userId !== project.created_by) {
      throw new Error('Access denied: not a project member')
    }

    const storedPath = await storageService.store(file, `project_${projectId}`)

    return imageRepository.create({
      project_id: projectId,
      file_name: file.originalname,
      file_path: storedPath,
      file_size: file.size,
      uploaded_by: userId,
      description,
    })
  },

  update(id: number, input: UpdateImageInput, userId: number): RubbingImage | null {
    const image = imageRepository.findById(id)
    if (!image) throw new Error('Image not found')

    if (image.uploaded_by !== userId) {
      const role = projectMemberRepository.getUserRole(userId, image.project_id)
      if (role !== 'admin') {
        throw new Error('Access denied: only uploader or project admin can update')
      }
    }

    return imageRepository.update(id, input)
  },

  delete(id: number, userId: number): boolean {
    const image = imageRepository.findById(id)
    if (!image) throw new Error('Image not found')

    if (image.uploaded_by !== userId) {
      const role = projectMemberRepository.getUserRole(userId, image.project_id)
      if (role !== 'admin') {
        throw new Error('Access denied: only uploader or project admin can delete')
      }
    }

    if (fs.existsSync(image.file_path)) {
      fs.unlinkSync(image.file_path)
    }

    return imageRepository.delete(id)
  },

  getImageFilePath(id: number): string | null {
    const image = imageRepository.findById(id)
    if (!image) return null
    return image.file_path
  },
}
