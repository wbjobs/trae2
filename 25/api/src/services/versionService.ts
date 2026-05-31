import { versionRepository } from '../repositories/versionRepository.js'
import { imageRepository } from '../repositories/imageRepository.js'
import { annotationRepository } from '../repositories/annotationRepository.js'
import { projectMemberRepository } from '../repositories/projectMemberRepository.js'
import type { ImageVersion, Annotation } from '../types/index.js'
import { storageService } from './storageService.js'

export interface CreateVersionInput {
  imageId: number
  file: Express.Multer.File
  userId: number
  description?: string
}

export interface VersionDiff {
  added: Annotation[]
  removed: Annotation[]
  modified: Array<{ old: Annotation; new: Annotation }>
  version1: ImageVersion
  version2: ImageVersion
}

export const versionService = {
  getByImage(imageId: number): ImageVersion[] {
    return versionRepository.findByImage(imageId)
  },

  getByImageAndVersion(imageId: number, versionNumber: number): ImageVersion | null {
    return versionRepository.findByImageAndVersion(imageId, versionNumber)
  },

  async createVersion(input: CreateVersionInput): Promise<ImageVersion> {
    const { imageId, file, userId, description } = input

    const image = imageRepository.findById(imageId)
    if (!image) throw new Error('Image not found')

    const isMember = projectMemberRepository.isMember(userId, image.project_id)
    if (!isMember) {
      throw new Error('Access denied: not a project member')
    }

    const nextVersion = versionRepository.getNextVersionNumber(imageId)
    const storedPath = await storageService.store(file, `versions/image_${imageId}`)

    return versionRepository.create({
      image_id: imageId,
      version_number: nextVersion,
      file_path: storedPath,
      description,
      created_by: userId,
    })
  },

  getVersionDiff(imageId: number, version1Id: number, version2Id: number): VersionDiff {
    const version1 = versionRepository.findById(version1Id)
    if (!version1) throw new Error(`Version ${version1Id} not found`)

    const version2 = versionRepository.findById(version2Id)
    if (!version2) throw new Error(`Version ${version2Id} not found`)

    if (version1.image_id !== imageId || version2.image_id !== imageId) {
      throw new Error('Versions do not belong to the specified image')
    }

    const allAnnotations = annotationRepository.findByImage(imageId)
    
    const v1Timestamp = new Date(version1.created_at).getTime()
    const v2Timestamp = new Date(version2.created_at).getTime()
    
    const annotationsInV1 = allAnnotations.filter(a => 
      new Date(a.created_at).getTime() <= v1Timestamp
    )
    const annotationsInV2 = allAnnotations.filter(a => 
      new Date(a.created_at).getTime() <= v2Timestamp
    )

    const added: Annotation[] = []
    const removed: Annotation[] = []
    const modified: Array<{ old: Annotation; new: Annotation }> = []

    const v1Map = new Map(annotationsInV1.map(a => [a.id, a]))
    const v2Map = new Map(annotationsInV2.map(a => [a.id, a]))

    for (const a of annotationsInV2) {
      if (!v1Map.has(a.id)) {
        added.push(a)
      }
    }

    for (const a of annotationsInV1) {
      if (!v2Map.has(a.id)) {
        removed.push(a)
      }
    }

    for (const a2 of annotationsInV2) {
      const a1 = v1Map.get(a2.id)
      if (a1 && (
        a1.x !== a2.x ||
        a1.y !== a2.y ||
        a1.width !== a2.width ||
        a1.height !== a2.height ||
        a1.content !== a2.content ||
        a1.status !== a2.status
      )) {
        modified.push({ old: a1, new: a2 })
      }
    }

    return {
      added,
      removed,
      modified,
      version1,
      version2,
    }
  },

  delete(id: number, userId: number): boolean {
    return versionRepository.delete(id)
  },
}
