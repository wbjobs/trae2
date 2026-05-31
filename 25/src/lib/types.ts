export type UserRole = 'admin' | 'annotator' | 'reviewer' | 'viewer'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export type ProjectStatus = 'active' | 'review' | 'archived'

export interface Project {
  id: number
  name: string
  description: string
  created_by: number
  created_at: string
  updated_at: string
}

export interface CreateProjectRequest {
  name: string
  description: string
}

export type AnnotationType = 'rectangle' | 'polygon' | 'text'

export type AnnotationStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface Annotation {
  id: number
  image_id: number
  user_id: number
  x: number
  y: number
  width: number
  height: number
  content: string
  status: AnnotationStatus
  created_at: string
  updated_at: string
}

export interface CreateAnnotationRequest {
  image_id: number
  x: number
  y: number
  width: number
  height: number
  content: string
  status?: AnnotationStatus
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

export type ReviewStatus = 'approved' | 'rejected' | 'pending'

export interface Review {
  id: number
  annotation_id: number
  reviewer_id: number
  status: ReviewStatus
  comment: string
  created_at: string
}

export interface Version {
  id: number
  image_id: number
  version_number: number
  file_path: string
  description: string
  created_by: number
  created_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}