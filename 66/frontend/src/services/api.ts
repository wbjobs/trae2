import axios from 'axios';
import {
  Resource,
  ResourceWithRelations,
  PaginatedResponse,
  GrowthRecord,
  Category,
  CategoryWithChildren,
  FieldImage,
  ResourceStats,
  GrowthStats,
  GeoCodeResult
} from '../types';

const API_BASE = '/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const resourceApi = {
  getAll: (params?: {
    page?: number;
    page_size?: number;
    category_id?: string;
    search?: string;
    province?: string;
    city?: string;
    protection_level?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }) => apiClient.get<PaginatedResponse<Resource>>('/resources', { params })
    .then(res => res.data),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: ResourceWithRelations }>(`/resources/${id}`)
      .then(res => res.data),

  create: (data: Partial<Resource>) =>
    apiClient.post<{ success: boolean; data: Resource }>('/resources', data)
      .then(res => res.data),

  update: (id: string, data: Partial<Resource>) =>
    apiClient.put<{ success: boolean; data: Resource }>(`/resources/${id}`, data)
      .then(res => res.data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/resources/${id}`)
      .then(res => res.data),

  getStats: () =>
    apiClient.get<{ success: boolean; data: ResourceStats }>('/resources/stats')
      .then(res => res.data),

  geocode: (data: { latitude: number; longitude: number; coord_string?: string }) =>
    apiClient.post<{ success: boolean; data: GeoCodeResult }>('/resources/geocode', data)
      .then(res => res.data),

  getHeatmapData: (params?: { category_id?: string; protection_level?: string }) =>
    apiClient.get<{ success: boolean; data: Array<{ name: string; value: [number, number, number]; resource_count: number }> }>('/resources/distribution/heatmap', { params })
      .then(res => res.data),

  getProvinceDistribution: () =>
    apiClient.get<{ success: boolean; data: any[] }>('/resources/distribution/provinces')
      .then(res => res.data),

  getGrowthRanking: (limit: number = 10) =>
    apiClient.get<{ success: boolean; data: any[] }>('/resources/ranking/growth-performance', { params: { limit } })
      .then(res => res.data)
};

export const growthApi = {
  getAll: (params?: {
    resource_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }) => apiClient.get<PaginatedResponse<GrowthRecord>>('/growth', { params })
    .then(res => res.data),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: GrowthRecord }>(`/growth/${id}`)
      .then(res => res.data),

  create: (data: Partial<GrowthRecord>) =>
    apiClient.post<{ success: boolean; data: GrowthRecord }>('/growth', data)
      .then(res => res.data),

  update: (id: string, data: Partial<GrowthRecord>) =>
    apiClient.put<{ success: boolean; data: GrowthRecord }>(`/growth/${id}`, data)
      .then(res => res.data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/growth/${id}`)
      .then(res => res.data),

  getStats: (resourceId: string) =>
    apiClient.get<{ success: boolean; data: GrowthStats }>(`/growth/stats/${resourceId}`)
      .then(res => res.data),

  getYearlyComparison: (params?: { start_year?: number; end_year?: number; resource_id?: string }) =>
    apiClient.get<{ success: boolean; data: any[] }>('/growth/analysis/yearly', { params })
      .then(res => res.data),

  getGrowthTrends: (params?: { limit?: number; category_id?: string }) =>
    apiClient.get<{ success: boolean; data: any[] }>('/growth/analysis/trends', { params })
      .then(res => res.data)
};

export const categoryApi = {
  getAll: () =>
    apiClient.get<{ success: boolean; data: Category[] }>('/categories')
      .then(res => res.data),

  getTree: () =>
    apiClient.get<{ success: boolean; data: CategoryWithChildren[] }>('/categories/tree')
      .then(res => res.data),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Category }>(`/categories/${id}`)
      .then(res => res.data),

  getDescendants: (id: string) =>
    apiClient.get<{ success: boolean; data: Category[] }>(`/categories/${id}/descendants`)
      .then(res => res.data),

  create: (data: Partial<Category>) =>
    apiClient.post<{ success: boolean; data: Category }>('/categories', data)
      .then(res => res.data),

  update: (id: string, data: Partial<Category>) =>
    apiClient.put<{ success: boolean; data: Category }>(`/categories/${id}`, data)
      .then(res => res.data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/categories/${id}`)
      .then(res => res.data)
};

export const imageApi = {
  getAll: (params?: {
    resource_id?: string;
    page?: number;
    page_size?: number;
  }) => apiClient.get<PaginatedResponse<FieldImage>>('/images', { params })
    .then(res => res.data),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: FieldImage }>(`/images/${id}`)
      .then(res => res.data),

  getByResourceId: (resourceId: string) =>
    apiClient.get<{ success: boolean; data: FieldImage[] }>(`/images/resource/${resourceId}`)
      .then(res => res.data),

  upload: (formData: FormData) =>
    apiClient.post<{ success: boolean; data: FieldImage[] }>('/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data),

  update: (id: string, data: Partial<FieldImage>) =>
    apiClient.put<{ success: boolean; data: FieldImage }>(`/images/${id}`, data)
      .then(res => res.data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/images/${id}`)
      .then(res => res.data)
};
