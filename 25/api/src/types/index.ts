import { type Request } from 'express'

export type UserRole = 'admin' | 'annotator' | 'reviewer' | 'viewer'

export interface User {
  id: number
  username: string
  password_hash: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface PublicUser {
  id: number
  username: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Project {
  id: number
  name: string
  description: string
  created_by: number
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: number
  project_id: number
  user_id: number
  role: UserRole
  joined_at: string
}

export interface RubbingImage {
  id: number
  project_id: number
  file_name: string
  file_path: string
  file_size: number
  uploaded_by: number
  description: string
  created_at: string
  updated_at: string
}

export interface ImageVersion {
  id: number
  image_id: number
  version_number: number
  file_path: string
  description: string
  created_by: number
  created_at: string
}

export interface Annotation {
  id: number
  image_id: number
  user_id: number
  x: number
  y: number
  width: number
  height: number
  content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export interface Review {
  id: number
  annotation_id: number
  reviewer_id: number
  status: 'approved' | 'rejected'
  comment: string
  created_at: string
}

export interface AuthPayload {
  userId: number
  username: string
  role: UserRole
}

declare module 'express' {
  interface Request {
    user?: AuthPayload
  }
}

export type AuthRequest = Request
