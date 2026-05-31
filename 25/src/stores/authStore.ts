import { create } from 'zustand'
import type { User, LoginRequest, RegisterRequest } from '@/lib/types'
import api from '@/lib/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
  clearError: () => void
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,

  login: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await api.auth.login(data)
      set({
        user: result.user,
        token: result.token,
        isAuthenticated: true,
        loading: false,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '登录失败',
      })
      throw err
    }
  },

  register: async (data) => {
    set({ loading: true, error: null })
    try {
      await api.auth.register(data)
      set({ loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '注册失败',
      })
      throw err
    }
  },

  logout: () => {
    api.auth.logout()
    set({ user: null, token: null, isAuthenticated: false, error: null })
  },

  setUser: (user) => set({ user }),

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    const token = get().token
    if (!token) {
      set({ isAuthenticated: false })
      return false
    }
    try {
      const user = await api.auth.me()
      set({ user, isAuthenticated: true })
      return true
    } catch {
      set({ user: null, token: null, isAuthenticated: false })
      return false
    }
  },
}))