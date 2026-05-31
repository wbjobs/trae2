import api from './api';
import { ApiResponse, User, Specimen, SpecimenFile, Annotation, SpecimenVersion, Tag, OperationLog } from '@shared/types';

export const authService = {
  login: (username: string, password: string, rememberMe?: boolean) =>
    api.post<ApiResponse<{ token: string; refreshToken: string; user: User }>>('/auth/login', { username, password, rememberMe }),

  refresh: (refreshToken: string) =>
    api.post<ApiResponse<{ token: string }>>('/auth/refresh', { refreshToken }),

  logout: () =>
    api.post<ApiResponse>('/auth/logout'),

  me: () =>
    api.get<ApiResponse<User>>('/auth/me')
};

export const userService = {
  list: (params?: Record<string, any>) =>
    api.get<ApiResponse<User[]>>('/users', { params }),

  get: (id: string) =>
    api.get<ApiResponse<User>>(`/users/${id}`),

  create: (data: Partial<User> & { password: string }) =>
    api.post<ApiResponse<User>>('/users', data),

  update: (id: string, data: Partial<User>) =>
    api.put<ApiResponse<User>>(`/users/${id}`, data),

  updatePassword: (id: string, oldPassword: string, newPassword: string) =>
    api.put<ApiResponse>(`/users/${id}/password`, { oldPassword, newPassword }),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/users/${id}`)
};

export const departmentService = {
  list: () =>
    api.get<ApiResponse>('/departments'),

  get: (id: string) =>
    api.get<ApiResponse>(`/departments/${id}`),

  create: (data: any) =>
    api.post<ApiResponse>('/departments', data),

  update: (id: string, data: any) =>
    api.put<ApiResponse>(`/departments/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/departments/${id}`)
};

export const specimenService = {
  list: (params?: Record<string, any>) =>
    api.get<ApiResponse<Specimen[]>>('/specimens', { params }),

  get: (id: string) =>
    api.get<ApiResponse<Specimen>>(`/specimens/${id}`),

  create: (data: Partial<Specimen>) =>
    api.post<ApiResponse<Specimen>>('/specimens', data),

  update: (id: string, data: Partial<Specimen> & { expectedVersion?: number; changeDescription?: string }) =>
    api.put<ApiResponse<Specimen>>(`/specimens/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/specimens/${id}`),

  acquireLock: (id: string) =>
    api.post<ApiResponse>(`/specimens/${id}/lock`),

  renewLock: (id: string) =>
    api.post<ApiResponse>(`/specimens/${id}/lock/renew`),

  releaseLock: (id: string) =>
    api.post<ApiResponse>(`/specimens/${id}/lock/release`)
};

export const fileService = {
  upload: (specimenId: string, file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('specimenId', specimenId);
    formData.append('file', file);

    return api.post<ApiResponse<SpecimenFile>>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      }
    });
  },

  uploadMultiple: (specimenId: string, files: File[]) => {
    const formData = new FormData();
    formData.append('specimenId', specimenId);
    files.forEach(file => formData.append('files', file));

    return api.post<ApiResponse<SpecimenFile[]>>('/files/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  getBySpecimen: (specimenId: string) =>
    api.get<ApiResponse<SpecimenFile[]>>(`/files/specimen/${specimenId}`),

  get: (id: string) =>
    api.get<ApiResponse<SpecimenFile>>(`/files/${id}`),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/files/${id}`),

  getPreviewUrl: (filename: string) =>
    `/files/preview/${filename}`,

  getDownloadUrl: (filename: string) =>
    `/files/download/${filename}`
};

export const uploadService = {
  init: (fileName: string, fileSize: number, specimenId: string, mimeType?: string) =>
    api.post<ApiResponse<{ sessionId: string; chunkSize: number; totalChunks: number }>>('/upload/init', {
      fileName,
      fileSize,
      specimenId,
      mimeType
    }),

  uploadChunk: (sessionId: string, chunkIndex: number, chunkData: string) =>
    api.post<ApiResponse<{ uploadedChunks: number[]; progress: number; isComplete?: boolean }>>('/upload/chunk', {
      sessionId,
      chunkIndex,
      chunkData
    }),

  complete: (sessionId: string) =>
    api.post<ApiResponse<SpecimenFile>>('/upload/complete', { sessionId }),

  status: (sessionId: string) =>
    api.get<ApiResponse>(`/upload/status/${sessionId}`),

  cancel: (sessionId: string) =>
    api.delete<ApiResponse>(`/upload/${sessionId}`)
};

export const tagService = {
  list: () =>
    api.get<ApiResponse<Tag[]>>('/tags'),

  categories: () =>
    api.get<ApiResponse<string[]>>('/tags/categories'),

  create: (data: Partial<Tag>) =>
    api.post<ApiResponse<Tag>>('/tags', data),

  update: (id: string, data: Partial<Tag>) =>
    api.put<ApiResponse<Tag>>(`/tags/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/tags/${id}`),

  getBySpecimen: (specimenId: string) =>
    api.get<ApiResponse<Tag[]>>(`/tags/specimen/${specimenId}`),

  addToSpecimen: (specimenId: string, tagId: string) =>
    api.post<ApiResponse>(`/tags/specimen/${specimenId}/${tagId}`),

  removeFromSpecimen: (specimenId: string, tagId: string) =>
    api.delete<ApiResponse>(`/tags/specimen/${specimenId}/${tagId}`)
};

export const logService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    action?: string;
    resourceType?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) =>
    api.get<ApiResponse<OperationLog[]>>('/logs', { params }),

  actions: () =>
    api.get<ApiResponse<string[]>>('/logs/actions'),

  stats: () =>
    api.get<ApiResponse>('/logs/stats')
};

export const annotationService = {
  getBySpecimen: (specimenId: string) =>
    api.get<ApiResponse<Annotation[]>>(`/annotations/specimen/${specimenId}`),

  create: (data: Partial<Annotation>) =>
    api.post<ApiResponse<Annotation>>('/annotations', data),

  reply: (id: string, content: string) =>
    api.post<ApiResponse>(`/annotations/${id}/reply`, { content }),

  updateStatus: (id: string, status: string) =>
    api.put<ApiResponse>(`/annotations/${id}/status`, { status }),

  delete: (id: string) =>
    api.delete<ApiResponse>(`/annotations/${id}`)
};

export const versionService = {
  getBySpecimen: (specimenId: string) =>
    api.get<ApiResponse<SpecimenVersion[]>>(`/versions/specimen/${specimenId}`),

  get: (id: string) =>
    api.get<ApiResponse<SpecimenVersion>>(`/versions/${id}`),

  rollback: (id: string) =>
    api.post<ApiResponse>(`/versions/${id}/rollback`),

  compare: (version1: string, version2: string) =>
    api.get<ApiResponse>(`/versions/compare/${version1}/${version2}`)
};
