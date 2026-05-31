import request from '@/utils/request';
import { Fossil, ApiResponse } from '@/types';

export const getFossils = (params?: any): Promise<ApiResponse<{
  fossils: Fossil[];
  total: number;
  totalPages: number;
  currentPage: number;
}>> => {
  return request.get('/fossil', { params });
};

export const getFossil = (id: string): Promise<ApiResponse<{ fossil: Fossil }>> => {
  return request.get(`/fossil/${id}`);
};

export const getFossilBySpecimenNo = (specimenNo: string): Promise<ApiResponse<{ fossil: Fossil }>> => {
  return request.get(`/fossil/specimen/${specimenNo}`);
};

export const createFossil = (data: Partial<Fossil>): Promise<ApiResponse<{ fossil: Fossil }>> => {
  return request.post('/fossil', data);
};

export const updateFossil = (id: string, data: Partial<Fossil>): Promise<ApiResponse<{ fossil: Fossil }>> => {
  return request.patch(`/fossil/${id}`, data);
};

export const deleteFossil = (id: string): Promise<ApiResponse> => {
  return request.delete(`/fossil/${id}`);
};

export const getFossilStats = (): Promise<ApiResponse<any>> => {
  return request.get('/fossil/stats');
};

export const searchSuggestions = (keyword: string): Promise<ApiResponse<{
  suggestions: any[];
}>> => {
  return request.get('/fossil/search/suggestions', { params: { keyword } });
};

export const advancedSearch = (data: any): Promise<ApiResponse<{
  fossils: Fossil[];
  total: number;
  totalPages: number;
  currentPage: number;
  aggregations: any;
}>> => {
  return request.post('/fossil/search/advanced', data);
};

export const getMuseums = (params?: any): Promise<ApiResponse<{
  museums: any[];
  total: number;
}>> => {
  return request.get('/fossil/museums/list', { params });
};

export const createMuseum = (data: any): Promise<ApiResponse<{ museum: any }>> => {
  return request.post('/fossil/museums', data);
};

export const createSharing = (data: any): Promise<ApiResponse<{ sharing: any }>> => {
  return request.post('/fossil/sharing', data);
};

export const getSharings = (params?: any): Promise<ApiResponse<{
  sharings: any[];
  total: number;
  totalPages: number;
  currentPage: number;
}>> => {
  return request.get('/fossil/sharing/list', { params });
};

export const getSharingByCode = (shareCode: string, password?: string): Promise<ApiResponse<{ sharing: any }>> => {
  return request.post(`/fossil/sharing/code/${shareCode}`, { password });
};

export const updateSharingStatus = (id: string, status: string): Promise<ApiResponse<{ sharing: any }>> => {
  return request.patch(`/fossil/sharing/${id}/status`, { status });
};

export const deleteSharing = (id: string): Promise<ApiResponse> => {
  return request.delete(`/fossil/sharing/${id}`);
};
