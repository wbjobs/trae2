import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { ProjectMember, UserRole } from '../types/index.js'

export interface AddMemberInput {
  project_id: number
  user_id: number
  role: UserRole
}

function rowToMember(row: any): ProjectMember {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role as UserRole,
    joined_at: row.joined_at,
  }
}

export const projectMemberRepository = {
  findByProject(projectId: number): ProjectMember[] {
    const rows = query(
      'SELECT * FROM project_members WHERE project_id = $projectId ORDER BY id',
      { $projectId: projectId }
    )
    return rows.map(rowToMember)
  },

  findByUserAndProject(userId: number, projectId: number): ProjectMember | null {
    const row = queryOne(
      'SELECT * FROM project_members WHERE user_id = $userId AND project_id = $projectId',
      { $userId: userId, $projectId: projectId }
    )
    return row ? rowToMember(row) : null
  },

  addMember(input: AddMemberInput): ProjectMember {
    const existing = this.findByUserAndProject(input.user_id, input.project_id)
    if (existing) {
      execute(
        'UPDATE project_members SET role = $role WHERE id = $id',
        { $role: input.role, $id: existing.id }
      )
      return this.findByUserAndProject(input.user_id, input.project_id)!
    }

    execute(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($project_id, $user_id, $role)`,
      {
        $project_id: input.project_id,
        $user_id: input.user_id,
        $role: input.role,
      }
    )
    const id = getLastInsertId()
    const row = queryOne('SELECT * FROM project_members WHERE id = $id', { $id: id })
    if (!row) throw new Error('Failed to add project member')
    return rowToMember(row)
  },

  removeMember(projectId: number, userId: number): boolean {
    const result = execute(
      'DELETE FROM project_members WHERE project_id = $projectId AND user_id = $userId',
      { $projectId: projectId, $userId: userId }
    )
    return result > 0
  },

  updateRole(projectId: number, userId: number, role: UserRole): ProjectMember | null {
    execute(
      'UPDATE project_members SET role = $role WHERE project_id = $projectId AND user_id = $userId',
      { $role: role, $projectId: projectId, $userId: userId }
    )
    return this.findByUserAndProject(userId, projectId)
  },

  isMember(userId: number, projectId: number): boolean {
    const row = queryOne(
      'SELECT COUNT(*) as count FROM project_members WHERE user_id = $userId AND project_id = $projectId',
      { $userId: userId, $projectId: projectId }
    )
    return row ? row.count > 0 : false
  },

  getUserRole(userId: number, projectId: number): UserRole | null {
    const row = queryOne(
      'SELECT role FROM project_members WHERE user_id = $userId AND project_id = $projectId',
      { $userId: userId, $projectId: projectId }
    )
    return row ? (row.role as UserRole) : null
  },
}
