import request from '@/utils/request';
import { User, LoginRequest, LoginResponse, ApiResponse } from '@/types';

export const login = (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
  return request.post('/auth/login', data);
};

export const register = (data: any): Promise<ApiResponse<LoginResponse>> => {
  return request.post('/auth/register', data);
};

export const getCurrentUser = (): Promise<ApiResponse<{ user: User }>> => {
  return request.get('/auth/me');
};

export const changePassword = (data: { oldPassword: string; newPassword: string }): Promise<ApiResponse> => {
  return request.patch('/auth/change-password', data);
};

export const getAllUsers = (): Promise<ApiResponse<{ users: User[] }>> => {
  return request.get('/auth');
};

export const updateUser = (id: string, data: Partial<User>): Promise<ApiResponse<{ user: User }>> => {
  return request.patch(`/auth/${id}`, data);
};

export const deleteUser = (id: string): Promise<ApiResponse> => {
  return request.delete(`/auth/${id}`);
};

export const updateProfile = (data: Partial<User>): Promise<ApiResponse<{ user: User }>> => {
  return request.patch('/auth/profile', data);
};
