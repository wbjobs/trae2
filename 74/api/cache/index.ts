import { SecurityData, AnomalyAlert, HeatmapPoint, Device } from '../../shared/types.js';

class LRUCache<T> {
  private cache: Map<string, { value: T; timestamp: number }>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  values(): T[] {
    this.cleanup();
    return Array.from(this.cache.values()).map(item => item.value);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const realtimeDataCache = new LRUCache<SecurityData>(500, 10 * 60 * 1000);
export const alertCache = new LRUCache<AnomalyAlert>(200, 30 * 60 * 1000);
export const heatmapCache = new LRUCache<{ points: HeatmapPoint[]; maxValue: number; updateTime: number }>(20, 10 * 60 * 1000);
export const deviceCache = new LRUCache<Device[]>(20, 10 * 60 * 1000);
export const hourlyRiskCache = new LRUCache<import('../../shared/types.js').RiskTrendHourly[]>(10, 5 * 60 * 1000);
export const riskOverviewCache = new LRUCache<any>(10, 5 * 60 * 1000);
export const areaRiskCache = new LRUCache<any>(10, 5 * 60 * 1000);
export const predictionCache = new LRUCache<any>(10, 3 * 60 * 1000);
export const deviceRankingCache = new LRUCache<any>(10, 5 * 60 * 1000);
export const featureCache = new LRUCache<any>(20, 10 * 60 * 1000);
export const historicalDataCache = new LRUCache<any>(30, 5 * 60 * 1000);
export const statusCountCache = new LRUCache<any>(10, 2 * 60 * 1000);

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    realtimeDataCache.clear();
    alertCache.clear();
    heatmapCache.clear();
    deviceCache.clear();
    hourlyRiskCache.clear();
    riskOverviewCache.clear();
    areaRiskCache.clear();
    predictionCache.clear();
    deviceRankingCache.clear();
    featureCache.clear();
    historicalDataCache.clear();
    statusCountCache.clear();
    return;
  }
  const caches = [heatmapCache, hourlyRiskCache, riskOverviewCache, areaRiskCache, predictionCache, deviceRankingCache, featureCache, statusCountCache];
  caches.forEach(c => c.clear());
}

export default {
  realtimeDataCache,
  alertCache,
  heatmapCache,
  deviceCache,
  hourlyRiskCache,
  riskOverviewCache,
  areaRiskCache,
  predictionCache,
  deviceRankingCache,
  featureCache,
  historicalDataCache,
  statusCountCache,
  invalidateCache,
};
