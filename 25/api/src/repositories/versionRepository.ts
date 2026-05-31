import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { ImageVersion } from '../types/index.js'

export const versionRepository = {
  findByImage(imageId: number): ImageVersion[] {
    return query(
      'SELECT * FROM image_versions WHERE image_id = $imageId ORDER BY version_number DESC',
      { $imageId: imageId }
    ) as ImageVersion[]
  },

  findByImageAndVersion(imageId: number, versionNumber: number): ImageVersion | null {
    return queryOne(
      'SELECT * FROM image_versions WHERE image_id = $imageId AND version_number = $versionNumber',
      { $imageId: imageId, $versionNumber: versionNumber }
    ) as ImageVersion | null
  },

  findById(id: number): ImageVersion | null {
    return queryOne(
      'SELECT * FROM image_versions WHERE id = $id',
      { $id: id }
    ) as ImageVersion | null
  },

  getNextVersionNumber(imageId: number): number {
    const result = queryOne(
      'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM image_versions WHERE image_id = $imageId',
      { $imageId: imageId }
    )
    return result ? result.next_version : 1
  },

  create(data: Omit<ImageVersion, 'id' | 'created_at'>): ImageVersion {
    execute(
      `INSERT INTO image_versions (
        image_id, version_number, file_path, description, created_by
      ) VALUES (
        $imageId, $versionNumber, $filePath, $description, $createdBy
      )`,
      {
        $imageId: data.image_id,
        $versionNumber: data.version_number,
        $filePath: data.file_path,
        $description: data.description || null,
        $createdBy: data.created_by,
      }
    )
    const id = getLastInsertId()
    return this.findById(id)!
  },

  delete(id: number): boolean {
    const result = execute(
      'DELETE FROM image_versions WHERE id = $id',
      { $id: id }
    )
    return result > 0
  },
}
