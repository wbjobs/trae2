import { create } from 'zustand';
import { User, UserRole } from '../types';
import { authService } from '../services/auth.service';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await authService.login({ username, password });
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      set({
        user: result.user,
        token: result.token,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({
      user: null,
      token: null,
      isAuthenticated: false
    });
  },

  setUser: (user: User | null) => {
    set({ user });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      try {
        const result = await authService.getCurrentUser();
        set({
          user: result.user,
          token,
          isAuthenticated: true
        });
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({
          user: null,
          token: null,
          isAuthenticated: false
        });
      }
    }
  }
}));

export const hasPermission = (userRole: UserRole | undefined, requiredRoles: UserRole[]): boolean => {
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
};

export const isAdmin = (role: UserRole | undefined): boolean => role === UserRole.ADMIN;
export const isCurator = (role: UserRole | undefined): boolean => 
  role === UserRole.ADMIN || role === UserRole.CURATOR;
export const isResearcher = (role: UserRole | undefined): boolean =>
  role === UserRole.ADMIN || role === UserRole.CURATOR || role === UserRole.RESEARCHER;
