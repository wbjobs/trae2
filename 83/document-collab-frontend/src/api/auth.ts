import { post, get } from './request'

export interface RegisterRequest {
  tenantId: string
  tenantName: string
  username: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface UserDTO {
  id: string
  tenantId: string
  username: string
  email: string
  role: string
  status: number
  createdAt: string
  updatedAt: string
}

export interface TokenResponse {
  token: string
  tokenType: string
  expiresIn: number
  user: UserDTO
}

export const authApi = {
  register: (data: RegisterRequest) => post<TokenResponse>('/auth/register', data),
  login: (data: LoginRequest) => post<TokenResponse>('/auth/login', data),
  getCurrentUser: () => get<UserDTO>('/auth/current'),
  logout: () => get<{ message: string }>('/auth/logout'),
}
