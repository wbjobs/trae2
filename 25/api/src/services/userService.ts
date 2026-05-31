import { userRepository } from '../repositories/userRepository.js'
import type { PublicUser, UserRole } from '../types/index.js'

export interface UpdateUserInput {
  email?: string
  role?: UserRole
  password?: string
}

function toPublicUser(user: {
  id: number
  username: string
  email: string
  role: string
  created_at: string
  updated_at: string
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as any,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

export const userService = {
  getAll(): PublicUser[] {
    return userRepository.findAll().map(toPublicUser)
  },

  getById(id: number): PublicUser {
    const user = userRepository.findById(id)
    if (!user) throw new Error('User not found')
    return toPublicUser(user)
  },

  update(id: number, input: UpdateUserInput): PublicUser {
    const user = userRepository.findById(id)
    if (!user) throw new Error('User not found')

    const updateData: any = {}
    if (input.email !== undefined) updateData.email = input.email
    if (input.role !== undefined) updateData.role = input.role
    if (input.password !== undefined) {
      updateData.password_hash = input.password
    }

    const updated = userRepository.update(id, updateData)
    if (!updated) throw new Error('Failed to update user')
    return toPublicUser(updated)
  },

  delete(id: number): boolean {
    return userRepository.delete(id)
  },
}
