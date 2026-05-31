import { useState, useEffect, useCallback, useMemo } from 'react';
import { message } from 'antd';
import { SoundingData, StationInfo, QueryParams, PaginatedResponse } from '@/types';
import { soundingService } from '@/services/soundingService';
import { dataCleaner } from '@/modules/dataFusion';
import { calculateIndices } from '@/modules/meteorologicalIndices';
import { changePointDetector } from '@/modules/changePointDetection';
import { ChangePoint, FieldChangePoints } from '@/modules/changePointDetection';

export function useSoundingData(stationId?: string) {
  const [loading, setLoading] = useState(false);
  const [soundingData, setSoundingData] = useState<SoundingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await soundingService.getLatestSoundingData(id);
      const cleaned = dataCleaner.clean(data.dataPoints);
      setSoundingData({ ...data, dataPoints: cleaned.cleanedPoints });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stationId) {
      loadData(stationId);
    }
  }, [stationId, loadData]);

  return {
    loading,
    soundingData,
    error,
    refresh: () => stationId && loadData(stationId),
    setSoundingData
  };
}

export function useMeteorologicalIndices(dataPoints: any[]) {
  return useMemo(() => {
    if (!dataPoints || dataPoints.length < 2) {
      return null;
    }
    try {
      return calculateIndices(dataPoints);
    } catch (error) {
      console.error('指标计算失败:', error);
      return null;
    }
  }, [dataPoints]);
}

export function useChangePoints(dataPoints: any[]) {
  return useMemo(() => {
    if (!dataPoints || dataPoints.length < 5) {
      return {
        points: [] as ChangePoint[],
        byField: [] as FieldChangePoints[],
        summary: null
      };
    }
    try {
      const byField = changePointDetector.detect(dataPoints);
      const points = changePointDetector.getAllChangePoints(dataPoints);
      const summary = changePointDetector.summarizeChanges(dataPoints);
      return { points, byField, summary };
    } catch (error) {
      console.error('突变点检测失败:', error);
      return {
        points: [] as ChangePoint[],
        byField: [] as FieldChangePoints[],
        summary: null
      };
    }
  }, [dataPoints]);
}

export function useStationList() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadStations = async () => {
      setLoading(true);
      try {
        const data = await soundingService.getStationList();
        setStations(data);
      } catch (error) {
        message.error('站点加载失败');
      } finally {
        setLoading(false);
      }
    };
    loadStations();
  }, []);

  return { stations, loading };
}

export function usePaginatedSoundingData() {
  const [loading, setLoading] = useState(false);
  const [dataList, setDataList] = useState<SoundingData[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });

  const loadData = useCallback(async (params: QueryParams) => {
    setLoading(true);
    try {
      const data: PaginatedResponse<SoundingData> = await soundingService.getSoundingDataList(params);
      setDataList(data.list);
      setPagination({
        current: data.pageNum,
        pageSize: data.pageSize,
        total: data.total
      });
      return data;
    } catch (error) {
      message.error('数据加载失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    dataList,
    pagination,
    loadData,
    setDataList
  };
}

export function useMultiStationData(stationIds: string[]) {
  const [loading, setLoading] = useState(false);
  const [dataList, setDataList] = useState<SoundingData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setDataList([]);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const promises = ids.map(id =>
        soundingService.getLatestSoundingData(id)
          .then(data => {
            const cleaned = dataCleaner.clean(data.dataPoints);
            return { ...data, dataPoints: cleaned.cleanedPoints };
          })
          .catch(err => {
            setErrors(prev => ({ ...prev, [id]: err.message }));
            return null;
          })
      );

      const results = await Promise.all(promises);
      const validData = results.filter((d): d is SoundingData => d !== null);
      setDataList(validData);
    } catch (error) {
      console.error('批量加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(stationIds);
  }, [stationIds, loadData]);

  return {
    loading,
    dataList,
    errors,
    refresh: () => loadData(stationIds)
  };
}
