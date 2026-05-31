import { http } from './http';
import { SoundingData, QueryParams, PaginatedResponse, StationInfo } from '@/types';

export const soundingApi = {
  getSoundingDataList: (params: QueryParams): Promise<PaginatedResponse<SoundingData>> => {
    return http.get('/sounding/list', { params });
  },

  getSoundingDataById: (id: string): Promise<SoundingData> => {
    return http.get(`/sounding/${id}`);
  },

  getLatestSoundingData: (stationId: string): Promise<SoundingData> => {
    return http.get(`/sounding/latest/${stationId}`);
  },

  getSoundingDataByTime: (stationId: string, time: string): Promise<SoundingData> => {
    return http.get(`/sounding/time/${stationId}`, { params: { time } });
  },

  getStationList: (): Promise<StationInfo[]> => {
    return http.get('/station/list');
  },

  getStationInfo: (stationId: string): Promise<StationInfo> => {
    return http.get(`/station/${stationId}`);
  },

  getSoundingDataRange: (stationId: string, startTime: string, endTime: string): Promise<SoundingData[]> => {
    return http.get('/sounding/range', { params: { stationId, startTime, endTime } });
  },

  deleteSoundingData: (id: string): Promise<void> => {
    return http.delete(`/sounding/${id}`);
  },

  batchDeleteSoundingData: (ids: string[]): Promise<void> => {
    return http.post('/sounding/batch-delete', { ids });
  }
};
