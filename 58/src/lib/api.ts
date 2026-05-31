import axios from 'axios';
import type { Annotation, Collision, Pipeline, Section } from '@shared/types';

export const api = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const apiClient = {
  listPipelines: async (params?: { type?: string; section?: string; q?: string }) => {
    const res = await api.get<ApiResponse<Pipeline[]>>('/pipelines', { params });
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
    return res.data.data as Pipeline[];
  },
  getPipeline: async (id: string) => {
    const res = await api.get<ApiResponse<Pipeline>>(`/pipelines/${id}`);
    if (!res.data.success) throw new Error(res.data.error || 'Not found');
    return res.data.data as Pipeline;
  },
  listSections: async () => {
    const res = await api.get<ApiResponse<Section[]>>('/sections');
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
    return res.data.data as Section[];
  },
  detectCollision: async (payload: { pipelineIds?: string[]; threshold?: number }) => {
    const res = await api.post<ApiResponse<{ conflicts: Collision[]; total: number }>>(
      '/collision/detect',
      payload,
    );
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
    return res.data.data as { conflicts: Collision[]; total: number };
  },
  saveAnnotation: async (payload: Partial<Annotation>) => {
    const res = await api.post<ApiResponse<Annotation>>('/annotations', payload);
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
    return res.data.data as Annotation;
  },
  listAnnotations: async () => {
    const res = await api.get<ApiResponse<Annotation[]>>('/annotations');
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
    return res.data.data as Annotation[];
  },
  deleteAnnotation: async (id: string) => {
    const res = await api.delete<ApiResponse<void>>(`/annotations/${id}`);
    if (!res.data.success) throw new Error(res.data.error || 'Request failed');
  },
};
