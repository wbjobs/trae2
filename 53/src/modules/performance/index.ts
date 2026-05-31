import _ from 'lodash-es';
import type { TrendDataPoint, MonitorData } from '../../types';

export class PerformanceOptimizer {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 5 * 60 * 1000;

  downsampleData<T extends { value: number; timestamp: string }>(
    data: T[],
    targetPoints: number = 200,
    method: 'lttb' | 'average' | 'max' | 'min' = 'lttb'
  ): T[] {
    if (data.length <= targetPoints) return data;

    switch (method) {
      case 'lttb':
        return this.largestTriangleThreeBuckets(data, targetPoints);
      case 'average':
        return this.averageDownsampling(data, targetPoints);
      case 'max':
        return this.aggregateDownsampling(data, targetPoints, Math.max);
      case 'min':
        return this.aggregateDownsampling(data, targetPoints, Math.min);
      default:
        return this.largestTriangleThreeBuckets(data, targetPoints);
    }
  }

  private largestTriangleThreeBuckets<T extends { value: number; timestamp: string }>(
    data: T[],
    targetPoints: number
  ): T[] {
    if (data.length <= targetPoints) return data;

    const sampled: T[] = [];
    const bucketSize = (data.length - 2) / (targetPoints - 2);

    sampled.push(data[0]);

    for (let i = 0; i < targetPoints - 2; i++) {
      const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
      const avgRange = Math.min(avgRangeEnd, data.length) - avgRangeStart;

      let avgX = 0;
      let avgY = 0;
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += j;
        avgY += data[j].value;
      }
      avgX /= avgRange;
      avgY /= avgRange;

      const rangeOffsets = Math.floor(i * bucketSize) + 1;
      const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

      let maxArea = -1;
      let maxAreaPoint = data[rangeOffsets];

      for (let j = rangeOffsets; j < rangeTo; j++) {
        const area =
          Math.abs(
            (sampled[sampled.length - 1].value - avgY) * (j - avgX) -
              (sampled[sampled.length - 1].value - data[j].value) * (avgX - avgX)
          ) / 2;

        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = data[j];
        }
      }

      sampled.push(maxAreaPoint);
    }

    sampled.push(data[data.length - 1]);
    return sampled;
  }

  private averageDownsampling<T extends { value: number; timestamp: string }>(
    data: T[],
    targetPoints: number
  ): T[] {
    const bucketSize = Math.ceil(data.length / targetPoints);
    const result: T[] = [];

    for (let i = 0; i < data.length; i += bucketSize) {
      const bucket = data.slice(i, i + bucketSize);
      const avgValue = _.mean(bucket.map((d) => d.value));
      result.push({
        ...bucket[Math.floor(bucket.length / 2)],
        value: avgValue,
      });
    }

    return result;
  }

  private aggregateDownsampling<T extends { value: number; timestamp: string }>(
    data: T[],
    targetPoints: number,
    aggregator: (values: number[]) => number
  ): T[] {
    const bucketSize = Math.ceil(data.length / targetPoints);
    const result: T[] = [];

    for (let i = 0; i < data.length; i += bucketSize) {
      const bucket = data.slice(i, i + bucketSize);
      const aggregatedValue = aggregator(bucket.map((d) => d.value));
      result.push({
        ...bucket[0],
        value: aggregatedValue,
      });
    }

    return result;
  }

  virtualizeList<T>(
    items: T[],
    scrollTop: number,
    itemHeight: number,
    visibleHeight: number
  ): { items: T[]; startIndex: number; endIndex: number } {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 10);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + visibleHeight) / itemHeight) + 10
    );

    return {
      items: items.slice(startIndex, endIndex),
      startIndex,
      endIndex,
    };
  }

  debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timer: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  throttle<T extends (...args: any[]) => any>(
    fn: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, ReturnType<T>>();
    return ((...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key)!;
      }
      const result = fn(...args);
      cache.set(key, result);
      return result;
    }) as T;
  }

  setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  getCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  clearCache(): void {
    this.cache.clear();
  }

  batchProcess<T, R>(
    items: T[],
    processor: (batch: T[]) => R[],
    batchSize: number = 1000
  ): R[] {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      results.push(...processor(batch));
    }
    return results;
  }

  async asyncBatchProcess<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return results;
  }

  calculateOptimalPoints(containerWidth: number, pointWidth: number = 2): number {
    return Math.max(50, Math.min(1000, Math.floor(containerWidth / pointWidth)));
  }

  lazyLoad<T>(
    items: T[],
    loadedCount: number,
    increment: number = 50
  ): { items: T[]; hasMore: boolean } {
    return {
      items: items.slice(0, loadedCount),
      hasMore: loadedCount < items.length,
    };
  }
}

export const performanceOptimizer = new PerformanceOptimizer();
