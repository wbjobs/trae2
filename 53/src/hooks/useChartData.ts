import { useState, useEffect, useMemo, useCallback } from 'react';
import type { TrendDataPoint, MonitorFactor, MonitorSection, AnomalyRange } from '../types';
import { getTrendData, getMultiTrendData } from '../api';
import { indicatorCalculator } from '../modules/indicator';
import { anomalyDetector } from '../modules/anomalyDetection';
import { performanceOptimizer } from '../modules/performance';

interface UseChartDataParams {
  factorId?: string;
  sectionId?: string;
  days?: number;
  enableAnomalyDetection?: boolean;
  enableDownsampling?: boolean;
  maxPoints?: number;
}

interface UseChartDataResult {
  data: TrendDataPoint[];
  loading: boolean;
  error: string | null;
  anomalyRanges: AnomalyRange[];
  indicatorResults: any;
  refresh: () => Promise<void>;
}

export const useChartData = (params: UseChartDataParams = {}): UseChartDataResult => {
  const {
    factorId,
    sectionId,
    days = 30,
    enableAnomalyDetection = true,
    enableDownsampling = true,
    maxPoints = 500,
  } = params;

  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anomalyRanges, setAnomalyRanges] = useState<AnomalyRange[]>([]);
  const [indicatorResults, setIndicatorResults] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!factorId) return;

    setLoading(true);
    setError(null);

    try {
      const trendData = await getTrendData(factorId, sectionId, days);

      let processedData = trendData;

      if (enableDownsampling && trendData.length > maxPoints) {
        processedData = performanceOptimizer.downsampleData(
          trendData,
          maxPoints,
          'lttb'
        );
      }

      setData(processedData);

      if (enableAnomalyDetection && processedData.length > 10) {
        const monitorData = processedData.map((d, i) => ({
          id: `${d.timestamp}_${i}`,
          sectionId: sectionId || '',
          sectionName: '',
          factorId: factorId || '',
          factorName: '',
          value: d.value,
          unit: '',
          timestamp: d.timestamp,
          quality: 'good',
          dataStatus: 'valid',
          standardValue: 0,
        }));

        const anomalies = anomalyDetector.detectAllAnomalies(monitorData as any, {
          threshold: 50,
          windowSize: 7,
        });
        setAnomalyRanges(anomalies);
      }

      const values = processedData.map((d) => d.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const variance =
        values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      setIndicatorResults({
        avg,
        max,
        min,
        stdDev,
        trend: indicatorCalculator.calculateTrend(values),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [factorId, sectionId, days, enableAnomalyDetection, enableDownsampling, maxPoints]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    anomalyRanges,
    indicatorResults,
    refresh: fetchData,
  };
};

interface UseMultiChartDataParams {
  factorIds: string[];
  sectionId?: string;
  days?: number;
  enableDownsampling?: boolean;
  maxPoints?: number;
}

interface UseMultiChartDataResult {
  data: Record<string, TrendDataPoint[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useMultiChartData = (
  params: UseMultiChartDataParams
): UseMultiChartDataResult => {
  const { factorIds, sectionId, days = 30, enableDownsampling = true, maxPoints = 500 } = params;

  const [data, setData] = useState<Record<string, TrendDataPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (factorIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getMultiTrendData(factorIds, sectionId, days);

      if (enableDownsampling) {
        const processedResult: Record<string, TrendDataPoint[]> = {};
        Object.entries(result).forEach(([factorId, trendData]) => {
          if (trendData.length > maxPoints) {
            processedResult[factorId] = performanceOptimizer.downsampleData(
              trendData,
              maxPoints,
              'lttb'
            );
          } else {
            processedResult[factorId] = trendData;
          }
        });
        setData(processedResult);
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [factorIds, sectionId, days, enableDownsampling, maxPoints]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
};

interface UseDebouncedValueParams<T> {
  value: T;
  delay?: number;
}

export function useDebouncedValue<T>(params: UseDebouncedValueParams<T>): T {
  const { value, delay = 300 } = params;
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface UseThrottledValueParams<T> {
  value: T;
  limit?: number;
}

export function useThrottledValue<T>(params: UseThrottledValueParams<T>): T {
  const { value, limit = 500 } = params;
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRun = useMemo(() => Date.now(), []);

  useEffect(() => {
    const now = Date.now();
    if (now - lastRun >= limit) {
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        setThrottledValue(value);
      }, limit - (now - lastRun));
      return () => clearTimeout(timer);
    }
  }, [value, limit, lastRun]);

  return throttledValue;
}
