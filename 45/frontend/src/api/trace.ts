import request from '@/utils/request';
import { Trace, ApiResponse } from '@/types';

export const getTraces = (params?: any): Promise<ApiResponse<{ traces: Trace[] }>> => {
  return request.get('/traces', { params });
};

export const getFossilTraces = (fossilId: string, params?: any): Promise<ApiResponse<{ traces: Trace[] }>> => {
  return request.get(`/traces/fossil/${fossilId}`, { params });
};

export const getTraceBySpecimenNo = (specimenNo: string, params?: any): Promise<ApiResponse<{ traces: Trace[] }>> => {
  return request.get(`/traces/specimen/${specimenNo}`, { params });
};

export const getTrace = (id: string): Promise<ApiResponse<{ trace: Trace }>> => {
  return request.get(`/traces/${id}`);
};

export const addTrace = (data: any): Promise<ApiResponse<{ trace: Trace }>> => {
  return request.post('/traces', data);
};

export const getTraceStats = (fossilId: string): Promise<ApiResponse<any>> => {
  return request.get(`/traces/fossil/${fossilId}/stats`);
};
