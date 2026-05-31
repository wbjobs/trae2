import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
  Project,
  CreateProjectRequest,
  Annotation,
  CreateAnnotationRequest,
  RubbingImage,
  Review,
  Version,
  ApiResponse,
} from './types'

const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function setToken(token: string): void {
  localStorage.setItem('token', token)
}

function clearToken(): void {
  localStorage.removeItem('token')
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }

  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => ({}))

  if (response.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('未授权，请重新登录')
  }

  if (!response.ok) {
    throw new Error(
      (data as ApiResponse)?.error ||
        (data as ApiResponse)?.message ||
        `请求失败 (${response.status})`
    )
  }

  return data as T
}

export const api = {
  auth: {
    async login(data: LoginRequest): Promise<LoginResponse> {
      const res = await request<ApiResponse<LoginResponse>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (res.success && res.data) {
        setToken(res.data.token)
        return res.data
      }
      throw new Error(res.error || '登录失败')
    },

    async register(data: RegisterRequest): Promise<User> {
      const res = await request<ApiResponse<User>>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '注册失败')
    },

    async logout(): Promise<void> {
      clearToken()
    },

    async me(): Promise<User> {
      const res = await request<ApiResponse<User>>('/auth/me')
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '获取用户信息失败')
    },
  },

  projects: {
    async list(): Promise<Project[]> {
      const res = await request<ApiResponse<Project[]>>('/projects')
      if (res.success && res.data) {
        return res.data
      }
      return []
    },

    async get(id: number): Promise<Project> {
      const res = await request<ApiResponse<Project>>(`/projects/${id}`)
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '获取项目失败')
    },

    async create(data: CreateProjectRequest): Promise<Project> {
      const res = await request<ApiResponse<Project>>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '创建项目失败')
    },

    async update(
      id: number,
      data: Partial<CreateProjectRequest>
    ): Promise<Project> {
      const res = await request<ApiResponse<Project>>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '更新项目失败')
    },

    async delete(id: number): Promise<void> {
      const res = await request<ApiResponse>(`/projects/${id}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        throw new Error(res.error || '删除项目失败')
      }
    },

    async getImages(projectId: number): Promise<RubbingImage[]> {
      const res = await request<ApiResponse<RubbingImage[]>>(
        `/projects/${projectId}/images`
      )
      if (res.success && res.data) {
        return res.data
      }
      return []
    },
  },

  images: {
    async upload(projectId: number, file: File, name: string): Promise<RubbingImage> {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name)
      
      const headers = {}
      const token = getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${BASE_URL}/projects/${projectId}/images`, {
        method: 'POST',
        headers,
        body: formData,
      })
      
      const data = await response.json()
      
      if (response.status === 401) {
        clearToken()
        window.location.href = '/login'
        throw new Error('未授权，请重新登录')
      }
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || '上传图片失败')
      }
      
      return data.data
    },

    getImageUrl(image: RubbingImage): string {
      return `/api/uploads/${image.file_path}`
    },
  },

  annotations: {
    async list(imageId: number): Promise<Annotation[]> {
      const res = await request<ApiResponse<Annotation[]>>(
        `/images/${imageId}/annotations`
      )
      if (res.success && res.data) {
        return res.data
      }
      return []
    },

    async create(data: CreateAnnotationRequest): Promise<Annotation> {
      const res = await request<ApiResponse<Annotation>>('/annotations', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '创建标注失败')
    },

    async update(
      id: number,
      data: Partial<CreateAnnotationRequest>
    ): Promise<Annotation> {
      const res = await request<ApiResponse<Annotation>>(
        `/annotations/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      )
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '更新标注失败')
    },

    async delete(id: number): Promise<void> {
      const res = await request<ApiResponse>(`/annotations/${id}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        throw new Error(res.error || '删除标注失败')
      }
    },
  },

  reviews: {
    async list(projectId?: number): Promise<Review[]> {
      const url = projectId !== undefined
        ? `/reviews?projectId=${projectId}`
        : '/reviews'
      const res = await request<ApiResponse<Review[]>>(url)
      if (res.success && res.data) {
        return res.data
      }
      return []
    },

    async create(
      annotationId: number,
      data: { status: 'approved' | 'rejected'; comment: string }
    ): Promise<Review> {
      const res = await request<ApiResponse<Review>>('/reviews', {
        method: 'POST',
        body: JSON.stringify({ annotation_id: annotationId, ...data }),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '创建审核失败')
    },
  },

  versions: {
    async list(imageId: number): Promise<Version[]> {
      const res = await request<ApiResponse<Version[]>>(
        `/images/${imageId}/versions`
      )
      if (res.success && res.data) {
        return res.data
      }
      return []
    },

    async create(imageId: number, description: string): Promise<Version> {
      const res = await request<ApiResponse<Version>>(`/images/${imageId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ description }),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '创建版本失败')
    },
  },

  users: {
    async list(): Promise<User[]> {
      const res = await request<ApiResponse<User[]>>('/admin/users')
      if (res.success && res.data) {
        return res.data
      }
      return []
    },

    async updateRole(
      userId: number,
      role: 'admin' | 'annotator' | 'reviewer' | 'viewer'
    ): Promise<User> {
      const res = await request<ApiResponse<User>>(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      if (res.success && res.data) {
        return res.data
      }
      throw new Error(res.error || '更新角色失败')
    },

    async delete(userId: number): Promise<void> {
      const res = await request<ApiResponse>(`/admin/users/${userId}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        throw new Error(res.error || '删除用户失败')
      }
    },
  },
}

export default api