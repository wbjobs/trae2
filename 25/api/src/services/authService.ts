import bcrypt from 'bcryptjs'
import { userRepository } from '../repositories/userRepository.js'
import { generateToken } from '../middleware/authMiddleware.js'
import type { PublicUser, AuthPayload } from '../types/index.js'

export interface RegisterInput {
  username: string
  password: string
  email: string
}

export interface LoginInput {
  username: string
  password: string
}

export interface AuthResult {
  token: string
  user: PublicUser
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

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const { username, password, email } = input

    if (!username || !password || !email) {
      throw new Error('Username, password, and email are required')
    }

    const existingUser = userRepository.findByUsername(username)
    if (existingUser) {
      throw new Error('Username already exists')
    }

    const existingEmail = userRepository.findByEmail(email)
    if (existingEmail) {
      throw new Error('Email already registered')
    }

    const password_hash = await bcrypt.hash(password, 10)

    const isFirstUser = userRepository.count() === 0
    const role = isFirstUser ? 'admin' : 'viewer'

    const user = userRepository.create({
      username,
      password_hash,
      email,
      role,
    })

    const payload: AuthPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    }
    const token = generateToken(payload)

    return { token, user: toPublicUser(user) }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const { username, password } = input

    if (!username || !password) {
      throw new Error('Username and password are required')
    }

    const user = userRepository.findByUsername(username)
    if (!user) {
      throw new Error('Invalid credentials')
    }

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      throw new Error('Invalid credentials')
    }

    const payload: AuthPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    }
    const token = generateToken(payload)

    return { token, user: toPublicUser(user) }
  },

  me(userId: number): PublicUser {
    const user = userRepository.findById(userId)
    if (!user) {
      throw new Error('User not found')
    }
    return toPublicUser(user)
  },
}
