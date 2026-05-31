import api from './api';
import { LoginRequest, LoginResponse, User } from '../types';

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  async register(data: Partial<User> & { password: string }): Promise<{ user: User; message: string }> {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await api.get<{ user: User }>('/auth/me');
    return response.data;
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await api.post('/auth/change-password', { oldPassword, newPassword });
    return response.data;
  },

  async logout(): Promise<{ message: string }> {
    const response = await api.post('/auth/logout');
    return response.data;
  }
};
