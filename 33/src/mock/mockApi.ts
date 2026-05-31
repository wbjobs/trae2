import { SoundingData, QueryParams, PaginatedResponse, StationInfo } from '@/types';
import { mockStations } from './stations';
import { generateMockSoundingList, generateMockSoundingData } from './soundingData';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface CacheKey {
  stationId: string;
  startTime?: string;
  endTime?: string;
}

const mockDataCache = new Map<string, SoundingData[]>();

const getCacheKey = (params: Partial<CacheKey>): string => {
  return `${params.stationId || 'all'}_${params.startTime || 'none'}_${params.endTime || 'none'}`;
};

const getOrGenerateData = (stationId: string, count: number = 50): SoundingData[] => {
  const station = mockStations.find(s => s.stationId === stationId) || mockStations[0];
  const cacheKey = getCacheKey({ stationId });

  if (!mockDataCache.has(cacheKey)) {
    const data = generateMockSoundingList(station.stationId, station.stationName, count);
    data.forEach((item, index) => {
      (item as any).id = `${stationId}_${index}_${Date.now()}`;
    });
    mockDataCache.set(cacheKey, data);
  }

  return mockDataCache.get(cacheKey) || [];
};

export const mockApi = {
  getSoundingDataList: async (params: QueryParams): Promise<PaginatedResponse<SoundingData>> => {
    await delay(500);
    const stationId = params.stationId || '54398';
    const allData = getOrGenerateData(stationId, 50);

    const pageNum = Math.max(1, params.pageNum);
    const pageSize = Math.max(1, Math.min(100, params.pageSize));
    const start = (pageNum - 1) * pageSize;
    const end = Math.min(start + pageSize, allData.length);
    const list = allData.slice(start, end);

    return {
      list,
      total: allData.length,
      pageNum,
      pageSize,
      pages: Math.ceil(allData.length / pageSize)
    };
  },

  getSoundingDataById: async (id: string): Promise<SoundingData> => {
    await delay(300);
    return generateMockSoundingData('54398', '北京观象台');
  },

  getLatestSoundingData: async (stationId: string): Promise<SoundingData> => {
    await delay(300);
    const station = mockStations.find(s => s.stationId === stationId) || mockStations[0];
    return generateMockSoundingData(station.stationId, station.stationName);
  },

  getSoundingDataByTime: async (stationId: string, time: string): Promise<SoundingData> => {
    await delay(300);
    const station = mockStations.find(s => s.stationId === stationId) || mockStations[0];
    return generateMockSoundingData(station.stationId, station.stationName);
  },

  getStationList: async (): Promise<StationInfo[]> => {
    await delay(200);
    return mockStations;
  },

  getStationInfo: async (stationId: string): Promise<StationInfo> => {
    await delay(200);
    return mockStations.find(s => s.stationId === stationId) || mockStations[0];
  },

  getSoundingDataRange: async (stationId: string, startTime: string, endTime: string): Promise<SoundingData[]> => {
    await delay(500);
    const station = mockStations.find(s => s.stationId === stationId) || mockStations[0];
    return generateMockSoundingList(station.stationId, station.stationName, 10);
  }
};
