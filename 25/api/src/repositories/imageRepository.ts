import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { RubbingImage } from '../types/index.js'

export interface CreateImageInput {
  project_id: number
  file_name: string
  file_path: string
  file_size: number
  uploaded_by: number
  description?: string
}

export interface UpdateImageInput {
  description?: string
}

function rowToImage(row: any): RubbingImage {
  return {
    id: row.id,
    project_id: row.project_id,
    file_name: row.file_name,
    file_path: row.file_path,
    file_size: row.file_size,
    uploaded_by: row.uploaded_by,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const imageRepository = {
  findAll(): RubbingImage[] {
    const rows = query('SELECT * FROM rubbing_images ORDER BY id DESC')
    return rows.map(rowToImage)
  },

  findById(id: number): RubbingImage | null {
    const row = queryOne('SELECT * FROM rubbing_images WHERE id = $id', { $id: id })
    return row ? rowToImage(row) : null
  },

  findByProject(projectId: number): RubbingImage[] {
    const rows = query(
      'SELECT * FROM rubbing_images WHERE project_id = $projectId ORDER BY id DESC',
      { $projectId: projectId }
    )
    return rows.map(rowToImage)
  },

  create(input: CreateImageInput): RubbingImage {
    execute(
      `INSERT INTO rubbing_images (project_id, file_name, file_path, file_size, uploaded_by, description)
       VALUES ($project_id, $file_name, $file_path, $file_size, $uploaded_by, $description)`,
      {
        $project_id: input.project_id,
        $file_name: input.file_name,
        $file_path: input.file_path,
        $file_size: input.file_size,
        $uploaded_by: input.uploaded_by,
        $description: input.description || null,
      }
    )
    const id = getLastInsertId()
    const image = this.findById(id)
    if (!image) throw new Error('Failed to create image')
    return image
  },

  update(id: number, input: UpdateImageInput): RubbingImage | null {
    const fields: string[] = []
    const params: Record<string, any> = { $id: id }

    if (input.description !== undefined) {
      fields.push('description = $description')
      params.$description = input.description
    }

    if (fields.length === 0) return this.findById(id)

    fields.push("updated_at = datetime('now')")

    execute(`UPDATE rubbing_images SET ${fields.join(', ')} WHERE id = $id`, params)
    return this.findById(id)
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM rubbing_images WHERE id = $id', { $id: id })
    return result > 0
  },
}
