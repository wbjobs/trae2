class CacheManager<T> {
  private cache: Map<string, { data: T; expireAt: number; hitCount: number }> = new Map();
  private defaultTTL: number;
  private maxCacheSize: number;

  constructor(defaultTTL: number = 60000, maxCacheSize: number = 500) {
    this.defaultTTL = defaultTTL;
    this.maxCacheSize = maxCacheSize;
  }

  set(key: string, data: T, ttl?: number): void {
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    const expireAt = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { data, expireAt, hitCount: 0 });
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return undefined;
    }

    item.hitCount++;
    return item.data;
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.cleanExpired();
    return this.cache.size;
  }

  getOrSet(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    return fetcher().then(data => {
      this.set(key, data, ttl);
      return data;
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestHitCount = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.hitCount < oldestHitCount) {
        oldestHitCount = value.hitCount;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expireAt) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): { size: number; hitRate: number } {
    let totalHits = 0;
    this.cache.forEach(item => {
      totalHits += item.hitCount;
    });
    return {
      size: this.cache.size,
      hitRate: totalHits / (this.cache.size + 1)
    };
  }
}

class PrefetchCacheManager<T> extends CacheManager<T> {
  private prefetchKeys: string[] = [];
  private prefetchFetcher: ((key: string) => Promise<T>) | null = null;

  setPrefetchStrategy(keys: string[], fetcher: (key: string) => Promise<T>): void {
    this.prefetchKeys = keys;
    this.prefetchFetcher = fetcher;
  }

  async prefetchAll(): Promise<void> {
    if (!this.prefetchFetcher) return;

    const batchSize = 5;
    for (let i = 0; i < this.prefetchKeys.length; i += batchSize) {
      const batch = this.prefetchKeys.slice(i, i + batchSize);
      await Promise.all(
        batch.map(key =>
          this.getOrSet(key, () => this.prefetchFetcher!(key))
        )
      );
    }
  }
}

export const flowCache = new CacheManager<any>(30000, 200);
export const featureCache = new PrefetchCacheManager<any>(120000, 100);
export const clusterCache = new CacheManager<any>(300000, 50);
export const alertCache = new CacheManager<any>(10000, 100);
export const statsCache = new CacheManager<any>(60000, 100);
export const historyCache = new PrefetchCacheManager<any>(180000, 150);

export const preloadCommonData = async (): Promise<void> => {
  console.log('Preloading common cache data...');
  setTimeout(async () => {
    try {
      const stations = await import('./data-generator.js').then(m => m.getStations());
      const stationIds = stations.slice(0, 10).map(s => s.stationId);

      historyCache.setPrefetchStrategy(
        stationIds.map(id => `flow:station:${id}:24`),
        async (key) => {
          const stationId = key.split(':')[2];
          const hours = parseInt(key.split(':')[3]) || 24;
          const { generateHistoricalFlowData } = await import('./data-generator.js');
          const historicalData = generateHistoricalFlowData(hours);
          const stationData: Record<string, any> = {};
          Object.entries(historicalData).forEach(([timestamp, flows]) => {
            const stationFlow = (flows as any[]).find(f => f.stationId === stationId);
            if (stationFlow) {
              stationData[timestamp] = stationFlow;
            }
          });
          return stationData;
        }
      );

      await historyCache.prefetchAll();
      console.log('Cache preloading completed');
    } catch (error) {
      console.error('Cache preloading failed:', error);
    }
  }, 5000);
};
