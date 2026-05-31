import { SoundingData, QueryParams, PaginatedResponse, StationInfo } from '@/types';
import { soundingApi } from '@/api/sounding';
import { mockApi } from '@/mock';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const soundingService = {
  getSoundingDataList: async (params: QueryParams): Promise<PaginatedResponse<SoundingData>> => {
    if (USE_MOCK) {
      return mockApi.getSoundingDataList(params);
    }
    return soundingApi.getSoundingDataList(params);
  },

  getSoundingDataById: async (id: string): Promise<SoundingData> => {
    if (USE_MOCK) {
      return mockApi.getSoundingDataById(id);
    }
    return soundingApi.getSoundingDataById(id);
  },

  getLatestSoundingData: async (stationId: string): Promise<SoundingData> => {
    if (USE_MOCK) {
      return mockApi.getLatestSoundingData(stationId);
    }
    return soundingApi.getLatestSoundingData(stationId);
  },

  getSoundingDataByTime: async (stationId: string, time: string): Promise<SoundingData> => {
    if (USE_MOCK) {
      return mockApi.getSoundingDataByTime(stationId, time);
    }
    return soundingApi.getSoundingDataByTime(stationId, time);
  },

  getStationList: async (): Promise<StationInfo[]> => {
    if (USE_MOCK) {
      return mockApi.getStationList();
    }
    return soundingApi.getStationList();
  },

  getStationInfo: async (stationId: string): Promise<StationInfo> => {
    if (USE_MOCK) {
      return mockApi.getStationInfo(stationId);
    }
    return soundingApi.getStationInfo(stationId);
  },

  getSoundingDataRange: async (stationId: string, startTime: string, endTime: string): Promise<SoundingData[]> => {
    if (USE_MOCK) {
      return mockApi.getSoundingDataRange(stationId, startTime, endTime);
    }
    return soundingApi.getSoundingDataRange(stationId, startTime, endTime);
  }
};
