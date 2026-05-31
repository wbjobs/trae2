import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { Review, ImageVersion } from '../types/index.js'

export interface CreateReviewInput {
  annotation_id: number
  reviewer_id: number
  status: 'approved' | 'rejected'
  comment?: string
}

export interface CreateVersionInput {
  image_id: number
  version_number: number
  file_path: string
  description?: string
  created_by: number
}

function rowToReview(row: any): Review {
  return {
    id: row.id,
    annotation_id: row.annotation_id,
    reviewer_id: row.reviewer_id,
    status: row.status as 'approved' | 'rejected',
    comment: row.comment,
    created_at: row.created_at,
  }
}

function rowToVersion(row: any): ImageVersion {
  return {
    id: row.id,
    image_id: row.image_id,
    version_number: row.version_number,
    file_path: row.file_path,
    description: row.description,
    created_by: row.created_by,
    created_at: row.created_at,
  }
}

export const reviewRepository = {
  findAll(): Review[] {
    const rows = query('SELECT * FROM reviews ORDER BY id DESC')
    return rows.map(rowToReview)
  },

  findById(id: number): Review | null {
    const row = queryOne('SELECT * FROM reviews WHERE id = $id', { $id: id })
    return row ? rowToReview(row) : null
  },

  findByAnnotation(annotationId: number): Review[] {
    const rows = query(
      'SELECT * FROM reviews WHERE annotation_id = $annotationId ORDER BY id DESC',
      { $annotationId: annotationId }
    )
    return rows.map(rowToReview)
  },

  findByProject(projectId: number): Review[] {
    const rows = query(
      `SELECT r.* FROM reviews r
       INNER JOIN annotations a ON r.annotation_id = a.id
       INNER JOIN rubbing_images i ON a.image_id = i.id
       WHERE i.project_id = $projectId
       ORDER BY r.id DESC`,
      { $projectId: projectId }
    )
    return rows.map(rowToReview)
  },

  create(input: CreateReviewInput): Review {
    execute(
      `INSERT INTO reviews (annotation_id, reviewer_id, status, comment)
       VALUES ($annotation_id, $reviewer_id, $status, $comment)`,
      {
        $annotation_id: input.annotation_id,
        $reviewer_id: input.reviewer_id,
        $status: input.status,
        $comment: input.comment || null,
      }
    )
    const id = getLastInsertId()
    const review = this.findById(id)
    if (!review) throw new Error('Failed to create review')
    return review
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM reviews WHERE id = $id', { $id: id })
    return result > 0
  },
}

export const versionRepository = {
  findByImage(imageId: number): ImageVersion[] {
    const rows = query(
      'SELECT * FROM image_versions WHERE image_id = $imageId ORDER BY version_number',
      { $imageId: imageId }
    )
    return rows.map(rowToVersion)
  },

  findByImageAndVersion(imageId: number, versionNumber: number): ImageVersion | null {
    const row = queryOne(
      'SELECT * FROM image_versions WHERE image_id = $imageId AND version_number = $versionNumber',
      { $imageId: imageId, $versionNumber: versionNumber }
    )
    return row ? rowToVersion(row) : null
  },

  getNextVersionNumber(imageId: number): number {
    const row = queryOne(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM image_versions WHERE image_id = $imageId',
      { $imageId: imageId }
    )
    return row ? row.next_version : 1
  },

  create(input: CreateVersionInput): ImageVersion {
    execute(
      `INSERT INTO image_versions (image_id, version_number, file_path, description, created_by)
       VALUES ($image_id, $version_number, $file_path, $description, $created_by)`,
      {
        $image_id: input.image_id,
        $version_number: input.version_number,
        $file_path: input.file_path,
        $description: input.description || null,
        $created_by: input.created_by,
      }
    )
    const id = getLastInsertId()
    const row = queryOne('SELECT * FROM image_versions WHERE id = $id', { $id: id })
    if (!row) throw new Error('Failed to create version')
    return rowToVersion(row)
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM image_versions WHERE id = $id', { $id: id })
    return result > 0
  },
}
