import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { Project } from '../types/index.js'

export interface CreateProjectInput {
  name: string
  description?: string
  created_by: number
}

export interface UpdateProjectInput {
  name?: string
  description?: string
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const projectRepository = {
  findAll(): Project[] {
    const rows = query('SELECT * FROM projects ORDER BY id DESC')
    return rows.map(rowToProject)
  },

  findById(id: number): Project | null {
    const row = queryOne('SELECT * FROM projects WHERE id = $id', { $id: id })
    return row ? rowToProject(row) : null
  },

  findByUserId(userId: number): Project[] {
    const rows = query(
      `SELECT p.* FROM projects p
       INNER JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = $userId
       ORDER BY p.id DESC`,
      { $userId: userId }
    )
    return rows.map(rowToProject)
  },

  create(input: CreateProjectInput): Project {
    execute(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($name, $description, $created_by)`,
      {
        $name: input.name,
        $description: input.description || null,
        $created_by: input.created_by,
      }
    )
    const id = getLastInsertId()
    const project = this.findById(id)
    if (!project) throw new Error('Failed to create project')
    return project
  },

  update(id: number, input: UpdateProjectInput): Project | null {
    const fields: string[] = []
    const params: Record<string, any> = { $id: id }

    if (input.name !== undefined) {
      fields.push('name = $name')
      params.$name = input.name
    }
    if (input.description !== undefined) {
      fields.push('description = $description')
      params.$description = input.description
    }

    if (fields.length === 0) return this.findById(id)

    fields.push("updated_at = datetime('now')")

    execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = $id`, params)
    return this.findById(id)
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM projects WHERE id = $id', { $id: id })
    return result > 0
  },
}
