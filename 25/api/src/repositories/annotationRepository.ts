import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { Annotation } from '../types/index.js'

export interface CreateAnnotationInput {
  image_id: number
  user_id: number
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
  status?: 'pending' | 'approved' | 'rejected'
}

function rowToAnnotation(row: any): Annotation {
  return {
    id: row.id,
    image_id: row.image_id,
    user_id: row.user_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    content: row.content,
    status: row.status as 'pending' | 'approved' | 'rejected',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const annotationRepository = {
  findAll(): Annotation[] {
    const rows = query('SELECT * FROM annotations ORDER BY id DESC')
    return rows.map(rowToAnnotation)
  },

  findById(id: number): Annotation | null {
    const row = queryOne('SELECT * FROM annotations WHERE id = $id', { $id: id })
    return row ? rowToAnnotation(row) : null
  },

  findByImage(imageId: number): Annotation[] {
    const rows = query(
      'SELECT * FROM annotations WHERE image_id = $imageId ORDER BY id',
      { $imageId: imageId }
    )
    return rows.map(rowToAnnotation)
  },

  findByUser(userId: number): Annotation[] {
    const rows = query(
      'SELECT * FROM annotations WHERE user_id = $userId ORDER BY id DESC',
      { $userId: userId }
    )
    return rows.map(rowToAnnotation)
  },

  create(input: CreateAnnotationInput): Annotation {
    execute(
      `INSERT INTO annotations (image_id, user_id, x, y, width, height, content)
       VALUES ($image_id, $user_id, $x, $y, $width, $height, $content)`,
      {
        $image_id: input.image_id,
        $user_id: input.user_id,
        $x: input.x,
        $y: input.y,
        $width: input.width,
        $height: input.height,
        $content: input.content,
      }
    )
    const id = getLastInsertId()
    const annotation = this.findById(id)
    if (!annotation) throw new Error('Failed to create annotation')
    return annotation
  },

  update(id: number, input: UpdateAnnotationInput): Annotation | null {
    const fields: string[] = []
    const params: Record<string, any> = { $id: id }

    if (input.x !== undefined) { fields.push('x = $x'); params.$x = input.x }
    if (input.y !== undefined) { fields.push('y = $y'); params.$y = input.y }
    if (input.width !== undefined) { fields.push('width = $width'); params.$width = input.width }
    if (input.height !== undefined) { fields.push('height = $height'); params.$height = input.height }
    if (input.content !== undefined) { fields.push('content = $content'); params.$content = input.content }
    if (input.status !== undefined) { fields.push('status = $status'); params.$status = input.status }

    if (fields.length === 0) return this.findById(id)

    fields.push("updated_at = datetime('now')")

    execute(`UPDATE annotations SET ${fields.join(', ')} WHERE id = $id`, params)
    return this.findById(id)
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM annotations WHERE id = $id', { $id: id })
    return result > 0
  },

  setStatus(id: number, status: 'pending' | 'approved' | 'rejected'): Annotation | null {
    execute(
      `UPDATE annotations SET status = $status, updated_at = datetime('now') WHERE id = $id`,
      { $status: status, $id: id }
    )
    return this.findById(id)
  },
}
