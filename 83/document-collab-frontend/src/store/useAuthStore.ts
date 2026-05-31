import { create } from 'zustand'
import { UserDTO } from '../api/auth'
import { jwtDecode } from 'jwt-decode'

interface AuthState {
  token: string | null
  user: UserDTO | null
  isAuthenticated: boolean
  setAuth: (token: string, user: UserDTO) => void
  logout: () => void
  loadFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  setAuth: (token: string, user: UserDTO) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },
  loadFromStorage: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      try {
        const decoded: any = jwtDecode(token)
        if (decoded.exp * 1000 > Date.now()) {
          set({ token, user: JSON.parse(userStr), isAuthenticated: true })
        } else {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
        }
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
  },
}))
