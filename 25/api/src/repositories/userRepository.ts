import { query, queryOne, execute, getLastInsertId } from '../db/index.js'
import type { User, UserRole } from '../types/index.js'

export interface CreateUserInput {
  username: string
  password_hash: string
  email: string
  role?: UserRole
}

export interface UpdateUserInput {
  email?: string
  role?: UserRole
  password_hash?: string
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    email: row.email,
    role: row.role as UserRole,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const userRepository = {
  findAll(): User[] {
    const rows = query('SELECT * FROM users ORDER BY id')
    return rows.map(rowToUser)
  },

  findById(id: number): User | null {
    const row = queryOne('SELECT * FROM users WHERE id = $id', { $id: id })
    return row ? rowToUser(row) : null
  },

  findByUsername(username: string): User | null {
    const row = queryOne('SELECT * FROM users WHERE username = $username', { $username: username })
    return row ? rowToUser(row) : null
  },

  findByEmail(email: string): User | null {
    const row = queryOne('SELECT * FROM users WHERE email = $email', { $email: email })
    return row ? rowToUser(row) : null
  },

  create(input: CreateUserInput): User {
    execute(
      `INSERT INTO users (username, password_hash, email, role)
       VALUES ($username, $password_hash, $email, COALESCE($role, 'viewer'))`,
      {
        $username: input.username,
        $password_hash: input.password_hash,
        $email: input.email,
        $role: input.role || null,
      }
    )
    const id = getLastInsertId()
    const user = this.findById(id)
    if (!user) throw new Error('Failed to create user')
    return user
  },

  update(id: number, input: UpdateUserInput): User | null {
    const fields: string[] = []
    const params: Record<string, any> = { $id: id }

    if (input.email !== undefined) {
      fields.push('email = $email')
      params.$email = input.email
    }
    if (input.role !== undefined) {
      fields.push('role = $role')
      params.$role = input.role
    }
    if (input.password_hash !== undefined) {
      fields.push('password_hash = $password_hash')
      params.$password_hash = input.password_hash
    }

    if (fields.length === 0) return this.findById(id)

    fields.push("updated_at = datetime('now')")

    execute(`UPDATE users SET ${fields.join(', ')} WHERE id = $id`, params)
    return this.findById(id)
  },

  delete(id: number): boolean {
    const result = execute('DELETE FROM users WHERE id = $id', { $id: id })
    return result > 0
  },

  count(): number {
    const row = queryOne('SELECT COUNT(*) as count FROM users')
    return row ? row.count : 0
  },
}
